-- Atomic edit of an order's fields + line items. Only pending/confirmed
-- orders may be edited (delivered/cancelled are immutable for audit). The
-- caller (update-order.ts) re-prices items: frozen unit_price_minor for
-- products already on the order, catalog price for newly-added ones, and
-- passes the enriched items as p_items. subtotal_minor is recomputed here
-- (orders has no recompute trigger); total_minor regenerates from it.
--
-- Already applied to the remote project via the Supabase MCP on 2026-06-10
-- (version 20260610223332). `create or replace` keeps this idempotent.

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
  -- Lock the order row and read its status.
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

  select coalesce(sum((x.quantity * x.unit_price_minor)::bigint), 0)
    into v_subtotal
  from jsonb_to_recordset(p_items) as x(
    quantity numeric,
    unit_price_minor bigint
  );

  update orders set
    scheduled_for      = p_scheduled_for,
    time_slot          = p_time_slot,
    payment_method     = p_payment_method,
    delivery_notes     = p_delivery_notes,
    delivery_fee_minor = coalesce(p_delivery_fee_minor, 0),
    subtotal_minor     = v_subtotal
  where id = p_order_id;

  -- Replace items wholesale (line_total_minor regenerates per row).
  delete from order_items where order_id = p_order_id;

  insert into order_items (
    order_id, product_key, quantity, unit_price_minor, product_snapshot
  )
  select
    p_order_id,
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
end;
$$;
