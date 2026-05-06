-- 022_create_order_with_items_v2
-- Updates the order-creation RPC to snapshot the new structured address
-- fields (neighborhood, street, building_no, apartment_no, postal_code)
-- into delivery_address_snapshot. Old orders' snapshots stay as-is —
-- the mapper reads new keys defensively.
--
-- create or replace keeps the same signature so call sites don't break.

create or replace function create_order_with_items(
  p_customer_id uuid,
  p_scheduled_for date,
  p_time_slot time_slot,
  p_payment_method payment_method,
  p_delivery_notes text,
  p_delivery_fee_minor bigint,
  p_created_by uuid,
  p_items jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id uuid;
  v_address_snapshot jsonb;
  v_subtotal bigint := 0;
  v_address_row addresses%rowtype;
  v_total_count int;
begin
  -- Snapshot the customer's primary address.
  select * into v_address_row
  from addresses a
  where a.customer_id = p_customer_id and a.is_primary
  limit 1;

  if not found then
    raise exception 'customer % has no primary address', p_customer_id
      using errcode = 'P0001';
  end if;

  v_address_snapshot := jsonb_build_object(
    'raw_text',     v_address_row.raw_text,
    'description',  v_address_row.description,
    'lat',          v_address_row.lat,
    'lng',          v_address_row.lng,
    'accuracy',     v_address_row.accuracy::text,
    'source',       v_address_row.source::text,
    'city',         v_address_row.city,
    'district',     v_address_row.district,
    'neighborhood', v_address_row.neighborhood,
    'street',       v_address_row.street,
    'building_no',  v_address_row.building_no,
    'apartment_no', v_address_row.apartment_no,
    'postal_code',  v_address_row.postal_code
  );

  select count(*) into v_total_count from jsonb_array_elements(p_items);
  if v_total_count = 0 then
    raise exception 'order needs at least one item'
      using errcode = 'P0001';
  end if;

  select coalesce(sum((x.quantity * x.unit_price_minor)::bigint), 0)
    into v_subtotal
  from jsonb_to_recordset(p_items) as x(
    quantity numeric,
    unit_price_minor bigint
  );

  insert into orders (
    customer_id,
    scheduled_for,
    time_slot,
    payment_method,
    delivery_notes,
    subtotal_minor,
    delivery_fee_minor,
    delivery_address_snapshot,
    created_by,
    source
  ) values (
    p_customer_id,
    p_scheduled_for,
    p_time_slot,
    p_payment_method,
    p_delivery_notes,
    v_subtotal,
    coalesce(p_delivery_fee_minor, 0),
    v_address_snapshot,
    p_created_by,
    'admin_manual'
  )
  returning id into v_order_id;

  insert into order_items (
    order_id, product_key, quantity, unit_price_minor, product_snapshot
  )
  select
    v_order_id,
    x.product_key,
    x.quantity,
    x.unit_price_minor,
    x.product_snapshot
  from jsonb_to_recordset(p_items) as x(
    product_key text,
    quantity numeric,
    unit_price_minor bigint,
    product_snapshot jsonb
  );

  insert into order_status_events (order_id, from_status, to_status, actor_id)
  values (v_order_id, null, 'pending', p_created_by);

  return v_order_id;
end;
$$;
