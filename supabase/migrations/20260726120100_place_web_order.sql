-- 20260726120100_place_web_order
-- Faz 2 — guest checkout writer for the public storefront (`/magaza`).
--
-- The admin order writer (create_order_with_items) is SECURITY INVOKER, hard-
-- codes source='admin_manual', requires the customer to ALREADY have a primary
-- address, and takes an admin p_created_by. None of that holds for a guest
-- checkout, so the storefront gets its own atomic writer.
--
-- place_web_order() runs everything in ONE transaction:
--   1. find-or-create the customer by phone (E.164, unique) — attach to an
--      existing record on a phone match, never duplicating a customer.
--   2. create a primary address ONLY when we have a geocoded pin AND the
--      customer has no primary address yet — never clobber an admin-corrected
--      pin on an existing customer.
--   3. snapshot the web-entered address onto the order (frozen jsonb).
--   4. insert the order with source='customer_web', created_by=NULL.
--   5. insert items + the initial 'pending' status event (no admin actor).
--
-- SECURITY: SECURITY DEFINER + EXECUTE revoked from anon/authenticated. Only
-- the service_role (used by the storefront's server-side repository) can call
-- it, so the customer's browser can never reach the writer or spoof a price.
-- The Server Action recomputes every line total from the catalog before this
-- runs; subtotal here is the sum of those authoritative line totals, exactly
-- like create_order_with_items.

create or replace function place_web_order(
  p_first_name          text,
  p_last_name           text,
  p_phone               text,
  p_email               text,
  p_address             jsonb,
  p_scheduled_for       date,
  p_time_slot           time_slot,
  p_payment_method      payment_method,
  p_delivery_notes      text,
  p_delivery_fee_minor  bigint,
  p_items               jsonb
) returns table (order_id uuid, order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id    uuid;
  v_order_number text;
  v_subtotal    bigint := 0;
  v_item_count  int;
  v_email       text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_has_coords  boolean;
  v_lat         double precision;
  v_lng         double precision;
  v_snapshot    jsonb;
begin
  -- ---- 1. Validate items -------------------------------------------------
  select count(*) into v_item_count from jsonb_array_elements(p_items);
  if v_item_count = 0 then
    raise exception 'order needs at least one item' using errcode = 'P0001';
  end if;

  -- ---- 2. Find or create the customer by phone ---------------------------
  -- Phone is the identity (unique). Drop an email that already belongs to any
  -- customer so the partial-unique email index can't abort a legitimate order.
  if v_email is not null and exists (select 1 from customers where email = v_email) then
    v_email := null;
  end if;

  -- Upsert-by-phone in one statement: no find-then-insert TOCTOU race under
  -- concurrency. On a phone match we only touch updated_at — existing name /
  -- email / status are preserved.
  insert into customers (first_name, last_name, email, phone, status, created_by)
  values (
    nullif(trim(p_first_name), ''),
    nullif(trim(p_last_name), ''),
    v_email,
    p_phone,
    'active',
    null
  )
  on conflict (phone) do update set updated_at = now()
  returning id into v_customer_id;

  -- ---- 3. Address: primary row only if we have a pin AND none exists yet --
  v_has_coords := (p_address ? 'lat') and (p_address ? 'lng')
                  and (p_address->>'lat') is not null and (p_address->>'lng') is not null;

  if v_has_coords then
    v_lat := (p_address->>'lat')::double precision;
    v_lng := (p_address->>'lng')::double precision;

    if not exists (
      select 1 from addresses where customer_id = v_customer_id and is_primary
    ) then
      insert into addresses (
        customer_id, raw_text, description, lat, lng, source, accuracy, geocoded_at,
        city, district, neighborhood, street, building_no, apartment_no, postal_code,
        is_primary, address_source
      ) values (
        v_customer_id,
        left(coalesce(nullif(trim(p_address->>'raw_text'), ''), v_lat::text || ', ' || v_lng::text), 500),
        nullif(trim(p_address->>'description'), ''),
        v_lat, v_lng,
        coalesce((p_address->>'source')::coordinate_source, 'geocoded_auto'),
        coalesce((p_address->>'accuracy')::coordinate_accuracy, 'unknown'),
        now(),
        nullif(trim(p_address->>'city'), ''),
        nullif(trim(p_address->>'district'), ''),
        nullif(trim(p_address->>'neighborhood'), ''),
        nullif(trim(p_address->>'street'), ''),
        nullif(trim(p_address->>'building_no'), ''),
        nullif(trim(p_address->>'apartment_no'), ''),
        nullif(trim(p_address->>'postal_code'), ''),
        true,
        'customer_signup'
      );
    end if;
  end if;

  -- ---- 4. Delivery address snapshot (always the web-entered address) ------
  -- Frozen onto the order so an existing customer's stored address is never
  -- the source of truth for THIS delivery.
  v_snapshot := jsonb_build_object(
    'raw_text',     coalesce(nullif(trim(p_address->>'raw_text'), ''), ''),
    'description',  p_address->>'description',
    'lat',          case when v_has_coords then v_lat else null end,
    'lng',          case when v_has_coords then v_lng else null end,
    'accuracy',     coalesce(p_address->>'accuracy', 'unknown'),
    'source',       coalesce(p_address->>'source', 'user_pin'),
    'city',         p_address->>'city',
    'district',     p_address->>'district',
    'neighborhood', p_address->>'neighborhood',
    'street',       p_address->>'street',
    'building_no',  p_address->>'building_no',
    'apartment_no', p_address->>'apartment_no',
    'postal_code',  p_address->>'postal_code'
  );

  -- ---- 5. Subtotal = sum of authoritative line totals --------------------
  select coalesce(sum(coalesce(x.line_total_minor, (x.quantity * x.unit_price_minor)::bigint)), 0)
    into v_subtotal
  from jsonb_to_recordset(p_items) as x(
    quantity numeric, unit_price_minor bigint, line_total_minor bigint
  );

  -- ---- 6. Insert order (customer_web, no admin actor) --------------------
  insert into orders (
    customer_id, scheduled_for, time_slot, payment_method, delivery_notes,
    subtotal_minor, delivery_fee_minor, delivery_address_snapshot, created_by, source
  ) values (
    v_customer_id, p_scheduled_for, p_time_slot, p_payment_method, p_delivery_notes,
    v_subtotal, coalesce(p_delivery_fee_minor, 0), v_snapshot, null, 'customer_web'
  )
  returning id, order_number into v_order_id, v_order_number;

  -- ---- 7. Items ----------------------------------------------------------
  insert into order_items (
    order_id, product_key, quantity, unit_price_minor, line_total_minor, product_snapshot
  )
  select
    v_order_id, x.product_key, x.quantity, x.unit_price_minor,
    coalesce(x.line_total_minor, (x.quantity * x.unit_price_minor)::bigint),
    x.product_snapshot
  from jsonb_to_recordset(p_items) as x(
    product_key text, quantity numeric, unit_price_minor bigint,
    line_total_minor bigint, product_snapshot jsonb
  );

  -- ---- 8. Initial status event (placed by the customer — no admin actor) --
  insert into order_status_events (order_id, from_status, to_status, actor_id)
  values (v_order_id, null, 'pending', null);

  return query select v_order_id, v_order_number;
end;
$$;

comment on function place_web_order is
  'Guest storefront checkout. Atomic: find-or-create customer by phone, optional primary address, order (source=customer_web, created_by=null) + items + initial pending event. SECURITY DEFINER; service_role only.';

-- Lock execution to the service role. The storefront repository calls this via
-- the service-role client; anon/authenticated can never invoke it directly.
revoke all on function place_web_order(
  text, text, text, text, jsonb, date, time_slot, payment_method, text, bigint, jsonb
) from public;
revoke all on function place_web_order(
  text, text, text, text, jsonb, date, time_slot, payment_method, text, bigint, jsonb
) from anon, authenticated;
grant execute on function place_web_order(
  text, text, text, text, jsonb, date, time_slot, payment_method, text, bigint, jsonb
) to service_role;
