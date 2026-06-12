-- 20260611140100_order_items_authoritative_line_total
--
-- Make order_items.line_total_minor the AUTHORITATIVE stored value instead of
-- a generated column. Tiered pricing produces line totals that aren't always
-- quantity × (whole-kuruş unit price) — e.g. 3 egg pkg must be exactly
-- ₺350.00, but 3 × 11667 = ₺350.01. The app's pricing engine computes the
-- exact total (round once); the RPCs now store it directly.
--
-- DROP EXPRESSION (PG13+) converts the generated column to a normal one while
-- KEEPING every existing value — historical order totals are unchanged.

alter table order_items alter column line_total_minor drop expression;
alter table order_items alter column line_total_minor set default 0;

-- ---- create_order_with_items: store the passed line_total, subtotal = sum ----
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
    raise exception 'order needs at least one item' using errcode = 'P0001';
  end if;

  -- Subtotal = sum of the authoritative line totals. Tolerant: if a caller
  -- omits line_total_minor (older clients), fall back to quantity × unit_price
  -- so a line total is never NULL.
  select coalesce(sum(coalesce(x.line_total_minor, (x.quantity * x.unit_price_minor)::bigint)), 0)
    into v_subtotal
  from jsonb_to_recordset(p_items) as x(
    quantity numeric,
    unit_price_minor bigint,
    line_total_minor bigint
  );

  insert into orders (
    customer_id, scheduled_for, time_slot, payment_method, delivery_notes,
    subtotal_minor, delivery_fee_minor, delivery_address_snapshot, created_by, source
  ) values (
    p_customer_id, p_scheduled_for, p_time_slot, p_payment_method, p_delivery_notes,
    v_subtotal, coalesce(p_delivery_fee_minor, 0), v_address_snapshot, p_created_by, 'admin_manual'
  )
  returning id into v_order_id;

  insert into order_items (
    order_id, product_key, quantity, unit_price_minor, line_total_minor, product_snapshot
  )
  select
    v_order_id, x.product_key, x.quantity, x.unit_price_minor,
    coalesce(x.line_total_minor, (x.quantity * x.unit_price_minor)::bigint),
    x.product_snapshot
  from jsonb_to_recordset(p_items) as x(
    product_key text,
    quantity numeric,
    unit_price_minor bigint,
    line_total_minor bigint,
    product_snapshot jsonb
  );

  insert into order_status_events (order_id, from_status, to_status, actor_id)
  values (v_order_id, null, 'pending', p_created_by);

  return v_order_id;
end;
$$;

-- ---- update_order_with_items: same authoritative-line-total handling --------
create or replace function update_order_with_items(
  p_order_id uuid,
  p_scheduled_for date,
  p_time_slot time_slot,
  p_payment_method payment_method,
  p_delivery_notes text,
  p_delivery_fee_minor bigint,
  p_items jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status order_status;
  v_subtotal bigint := 0;
  v_count int;
begin
  select status into v_status from orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id using errcode = 'P0001';
  end if;
  if v_status not in ('pending', 'confirmed') then
    raise exception 'order % is % and cannot be edited', p_order_id, v_status
      using errcode = 'P0001';
  end if;

  select count(*) into v_count from jsonb_array_elements(p_items);
  if v_count = 0 then
    raise exception 'order needs at least one item' using errcode = 'P0001';
  end if;

  select coalesce(sum(coalesce(x.line_total_minor, (x.quantity * x.unit_price_minor)::bigint)), 0)
    into v_subtotal
  from jsonb_to_recordset(p_items) as x(
    quantity numeric,
    unit_price_minor bigint,
    line_total_minor bigint
  );

  update orders set
    scheduled_for      = p_scheduled_for,
    time_slot          = p_time_slot,
    payment_method     = p_payment_method,
    delivery_notes     = p_delivery_notes,
    delivery_fee_minor = coalesce(p_delivery_fee_minor, 0),
    subtotal_minor     = v_subtotal
  where id = p_order_id;

  delete from order_items where order_id = p_order_id;

  insert into order_items (
    order_id, product_key, quantity, unit_price_minor, line_total_minor, product_snapshot
  )
  select
    p_order_id, x.product_key, x.quantity, x.unit_price_minor,
    coalesce(x.line_total_minor, (x.quantity * x.unit_price_minor)::bigint),
    x.product_snapshot
  from jsonb_to_recordset(p_items) as x(
    product_key text,
    quantity numeric,
    unit_price_minor bigint,
    line_total_minor bigint,
    product_snapshot jsonb
  );
end;
$$;
