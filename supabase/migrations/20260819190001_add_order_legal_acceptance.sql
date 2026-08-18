-- 20260819190001_add_order_legal_acceptance
--
-- Store the two sales documents and their version references with the web
-- order that was placed after accepting them. The nullable column keeps every
-- legacy/admin/recurring order backward-compatible. New customer web orders
-- pass through the updated writers below in one transaction with this record.

alter table orders
  add column legal_acceptance jsonb;

alter table orders
  add constraint orders_legal_acceptance_shape
  check (
    legal_acceptance is null
    or (
      jsonb_typeof(legal_acceptance) = 'object'
      and legal_acceptance ? 'accepted_at'
      and jsonb_typeof(legal_acceptance -> 'accepted_at') = 'string'
      and legal_acceptance ? 'documents'
      and jsonb_typeof(legal_acceptance -> 'documents') = 'array'
      and jsonb_array_length(legal_acceptance -> 'documents') > 0
    )
  );

comment on column orders.legal_acceptance is
  'Version references for the sales documents accepted at storefront checkout. Nullable for legacy, admin, and recurring-generated orders; contains no card, credential, or customer-identity data.';

-- The new argument changes each function identity, so replace both web writers
-- together. `place_guest_order` delegates to `place_web_order`; recreating it
-- prevents any guest path from retaining the pre-acceptance signature.
drop function if exists place_guest_order(
  text, text, text, text, jsonb, date, time_slot, payment_method, text, bigint, jsonb
);
drop function if exists place_web_order(
  uuid, uuid, date, time_slot, payment_method, text, bigint, jsonb
);

create function place_web_order(
  p_customer_id        uuid,
  p_address_id         uuid,
  p_scheduled_for      date,
  p_time_slot          time_slot,
  p_payment_method     payment_method,
  p_delivery_notes     text,
  p_delivery_fee_minor bigint,
  p_legal_acceptance   jsonb,
  p_items              jsonb
) returns table (order_id uuid, order_number text, fulfillment_channel public.fulfillment_channel)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id     uuid;
  v_order_number text;
  v_address_row  addresses%rowtype;
  v_subtotal     bigint := 0;
  v_item_count   int;
  v_channel      public.fulfillment_channel;
  v_in_area      boolean;
begin
  -- The Server Action performs the semantic Zod validation. This RPC keeps a
  -- second, transaction-bound guard so a missing acceptance can never create a
  -- customer web order through this writer.
  if p_legal_acceptance is null
     or jsonb_typeof(p_legal_acceptance) <> 'object'
     or jsonb_typeof(p_legal_acceptance -> 'accepted_at') <> 'string'
     or jsonb_typeof(p_legal_acceptance -> 'documents') <> 'array'
     or jsonb_array_length(p_legal_acceptance -> 'documents') = 0 then
    raise exception 'sales legal acceptance is required' using errcode = 'P0010';
  end if;

  select count(*) into v_item_count from jsonb_array_elements(p_items);
  if v_item_count = 0 then
    raise exception 'order needs at least one item' using errcode = 'P0001';
  end if;

  if not exists (select 1 from customers where id = p_customer_id) then
    raise exception 'customer % not found', p_customer_id using errcode = 'P0002';
  end if;

  select * into v_address_row
  from addresses a
  where a.id = p_address_id and a.customer_id = p_customer_id;
  if not found then
    raise exception 'address % does not belong to customer %', p_address_id, p_customer_id
      using errcode = 'P0004';
  end if;

  v_channel := resolve_channel_for_items(p_items, v_address_row);

  if v_channel = 'delivery' then
    if coalesce(trim(v_address_row.street), '') = ''
       or coalesce(trim(v_address_row.apartment_no), '') = '' then
      raise exception 'route order needs street and apartment_no' using errcode = 'P0006';
    end if;

    v_in_area := is_within_service_area(v_address_row.lat, v_address_row.lng);
    if v_in_area is false then
      raise exception 'address is outside the delivery service area' using errcode = 'P0007';
    end if;
  end if;

  select coalesce(sum(coalesce(x.line_total_minor, (x.quantity * x.unit_price_minor)::bigint)), 0)
    into v_subtotal
  from jsonb_to_recordset(p_items) as x(
    quantity numeric, unit_price_minor bigint, line_total_minor bigint
  );

  insert into orders (
    customer_id, address_id, scheduled_for, time_slot, payment_method, delivery_notes,
    subtotal_minor, delivery_fee_minor, delivery_address_snapshot, created_by, source,
    fulfillment_channel, legal_acceptance
  ) values (
    p_customer_id, v_address_row.id, p_scheduled_for, p_time_slot, p_payment_method,
    p_delivery_notes, v_subtotal, coalesce(p_delivery_fee_minor, 0),
    address_snapshot(v_address_row), null, 'customer_web', v_channel,
    p_legal_acceptance
  )
  returning id, orders.order_number into v_order_id, v_order_number;

  insert into order_items (
    order_id, product_key, quantity, unit_price_minor, line_total_minor,
    product_snapshot, fulfillment_type
  )
  select
    v_order_id, x.product_key, x.quantity, x.unit_price_minor,
    coalesce(x.line_total_minor, (x.quantity * x.unit_price_minor)::bigint),
    x.product_snapshot,
    coalesce(p.fulfillment_type, 'delivery')
  from jsonb_to_recordset(p_items) as x(
    product_key text, quantity numeric, unit_price_minor bigint,
    line_total_minor bigint, product_snapshot jsonb
  )
  left join products p on p.key = x.product_key;

  insert into order_status_events (order_id, from_status, to_status, actor_id)
  values (v_order_id, null, 'pending', null);

  return query select v_order_id, v_order_number, v_channel;
end;
$$;

comment on function place_web_order is
  'Storefront checkout writer. Requires a transaction-bound sales legal acceptance record, then creates one customer_web order with address, fulfillment, item, and acceptance snapshots. Guards: P0002 customer, P0004 address ownership, P0006 route address completeness, P0007 outside service area, P0010 missing acceptance. SECURITY DEFINER; service_role only.';

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
  p_legal_acceptance   jsonb,
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

  return query
    select w.order_id, w.order_number, w.fulfillment_channel
    from place_web_order(
      v_customer_id, v_address_id, p_scheduled_for, p_time_slot, p_payment_method,
      p_delivery_notes, p_delivery_fee_minor, p_legal_acceptance, p_items
    ) as w;
end;
$$;

comment on function place_guest_order is
  'Guest storefront writer. Mints a new customer and address, then delegates to place_web_order in the same transaction; missing legal acceptance aborts the whole transaction with the delegated writer.';

revoke all on function place_web_order(uuid, uuid, date, time_slot, payment_method, text, bigint, jsonb, jsonb) from public;
revoke all on function place_web_order(uuid, uuid, date, time_slot, payment_method, text, bigint, jsonb, jsonb) from anon, authenticated;
grant execute on function place_web_order(uuid, uuid, date, time_slot, payment_method, text, bigint, jsonb, jsonb) to service_role;

revoke all on function place_guest_order(text, text, text, text, jsonb, date, time_slot, payment_method, text, bigint, jsonb, jsonb) from public;
revoke all on function place_guest_order(text, text, text, text, jsonb, date, time_slot, payment_method, text, bigint, jsonb, jsonb) from anon, authenticated;
grant execute on function place_guest_order(text, text, text, text, jsonb, date, time_slot, payment_method, text, bigint, jsonb, jsonb) to service_role;
