-- 20260814120100_place_guest_order
--
-- WHY: ordering without an account. Every storefront write today is keyed off
-- `auth_user_id` — `link_customer_account` raises P0001 on a null one, and
-- `upsert_customer_address` resolves the customer only from it (P0002) — so a
-- visitor with no login cannot get a `customers` row, cannot get an `addresses`
-- row, and therefore cannot satisfy `orders`' two NOT NULL foreign keys.
--
-- `place_web_order` itself was already account-agnostic: it wants a customer id
-- and an address id that belong together, and never reads `auth_user_id`. So
-- this migration adds the ONE missing piece — a writer that can mint those two
-- rows for a guest — and then delegates to `place_web_order` rather than
-- duplicating it. Channel derivation, the route-address completeness check, the
-- service-area check, the address snapshot and the order number all stay in a
-- single implementation.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: look anything up. No phone lookup, no
-- e-mail lookup, no merge. The previous guest writer (20260726120100) did
-- `on conflict (phone) do update`, which silently attached every guest order to
-- whichever legacy phone-ordered record shared the number. That is the exact
-- regression the owner outlawed on 2026-08-05, and re-introducing guests must
-- not re-introduce it.

create function place_guest_order(
  p_first_name         text,
  p_last_name          text,
  p_phone              text,
  p_email              text,
  p_address            jsonb,
  p_scheduled_for      date,
  p_time_slot          time_slot,
  p_payment_method     payment_method,
  p_delivery_notes     text,
  p_delivery_fee_minor bigint,
  p_items              jsonb
) returns table (order_id uuid, order_number text, fulfillment_channel public.fulfillment_channel)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_address_id  uuid;
  v_lat double precision := (p_address->>'lat')::double precision;
  v_lng double precision := (p_address->>'lng')::double precision;
  v_raw text := left(coalesce(nullif(trim(p_address->>'raw_text'), ''),
                              v_lat::text || ', ' || v_lng::text), 500);
begin
  if p_phone is null or trim(p_phone) = '' then
    raise exception 'guest order needs a phone' using errcode = 'P0008';
  end if;
  if v_lat is null or v_lng is null then
    raise exception 'address needs coordinates' using errcode = 'P0006';
  end if;

  -- A brand new customer, every time. See the header: no matching, by design.
  insert into customers (
    first_name, last_name, email, phone, status, auth_user_id, created_by, origin
  ) values (
    nullif(trim(coalesce(p_first_name, '')), ''),
    nullif(trim(coalesce(p_last_name, '')), ''),
    nullif(lower(trim(coalesce(p_email, ''))), ''),
    nullif(trim(p_phone), ''),
    'active', null, null, 'customer_guest'
  )
  returning id into v_customer_id;

  insert into addresses (
    customer_id, label, raw_text, description, lat, lng, source, accuracy,
    geocoded_at, geo_verified_at, city, district, neighborhood, street,
    building_no, apartment_no, postal_code, is_primary, address_source
  ) values (
    v_customer_id,
    nullif(trim(p_address->>'label'), ''),
    v_raw,
    nullif(trim(p_address->>'description'), ''),
    v_lat, v_lng,
    coalesce((p_address->>'source')::coordinate_source, 'user_pin'),
    coalesce((p_address->>'accuracy')::coordinate_accuracy, 'unknown'),
    now(),
    case when (p_address->>'geo_verified')::boolean then now() else null end,
    nullif(trim(p_address->>'city'), ''),
    nullif(trim(p_address->>'district'), ''),
    nullif(trim(p_address->>'neighborhood'), ''),
    nullif(trim(p_address->>'street'), ''),
    nullif(trim(p_address->>'building_no'), ''),
    nullif(trim(p_address->>'apartment_no'), ''),
    nullif(trim(p_address->>'postal_code'), ''),
    true,
    'customer_signup'
  )
  returning id into v_address_id;

  -- One order-writing path. Anything place_web_order rejects (P0001 empty
  -- basket, P0006 incomplete route address, P0007 outside the service area)
  -- aborts this whole transaction, so a rejected guest order leaves no orphan
  -- customer or address behind.
  return query
    select w.order_id, w.order_number, w.fulfillment_channel
    from place_web_order(
      v_customer_id, v_address_id, p_scheduled_for, p_time_slot, p_payment_method,
      p_delivery_notes, p_delivery_fee_minor, p_items
    ) as w;
end;
$$;

comment on function place_guest_order is
  'Checkout writer for a visitor with no account. Mints a fresh customers row (origin=customer_guest, auth_user_id=null) and its address, then delegates to place_web_order. NEVER looks a customer up by phone or e-mail — one new row per order, by owner decision. Guards: P0008 missing phone, P0006 missing coordinates, plus everything place_web_order raises. SECURITY DEFINER; service_role only.';

revoke all on function place_guest_order(text, text, text, text, jsonb, date, time_slot, payment_method, text, bigint, jsonb) from public;
revoke all on function place_guest_order(text, text, text, text, jsonb, date, time_slot, payment_method, text, bigint, jsonb) from anon, authenticated;
grant execute on function place_guest_order(text, text, text, text, jsonb, date, time_slot, payment_method, text, bigint, jsonb) to service_role;

-- ---- Order lookup without a login -------------------------------------------
-- A guest has no /hesap, so without this their order number is a dead end: they
-- cannot see whether it is paid, and — after PR #67 — cannot reach "Ödemeyi
-- tamamla" for a card payment that fell through. That is what drove customers to
-- place duplicate orders in the first place.
--
-- Authorised by order number AND the phone on the order. Order numbers are
-- sequential (ORD-2026-00475), so the number alone is guessable; the phone is
-- what makes a scan useless. Returns only status fields — no address, no items,
-- no name — so a lucky guess still discloses almost nothing.
create function lookup_guest_order(
  p_order_number text,
  p_phone        text
-- Every enum here shares its name with the column that carries it, so the type
-- references are schema-qualified — the same precaution place_web_order takes
-- for `fulfillment_channel`.
) returns table (
  order_id       uuid,
  order_number   text,
  status         public.order_status,
  payment_status public.payment_status,
  payment_method public.payment_method,
  total_minor    bigint,
  scheduled_for  date,
  fulfillment_channel public.fulfillment_channel,
  created_at     timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select o.id, o.order_number, o.status, o.payment_status, o.payment_method,
         o.total_minor, o.scheduled_for, o.fulfillment_channel, o.created_at
  from orders o
  join customers c on c.id = o.customer_id
  where o.order_number = trim(p_order_number)
    and c.phone is not null
    and c.phone = trim(p_phone)
  limit 1;
$$;

comment on function lookup_guest_order is
  'Read one order by number + the phone recorded on it, for customers with no login. Returns status fields only — never address, items or name — so a guessed order number discloses nothing useful. SECURITY DEFINER; service_role only.';

revoke all on function lookup_guest_order(text, text) from public;
revoke all on function lookup_guest_order(text, text) from anon, authenticated;
grant execute on function lookup_guest_order(text, text) to service_role;
