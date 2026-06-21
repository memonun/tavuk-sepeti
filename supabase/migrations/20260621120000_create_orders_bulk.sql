-- 20260621120000_create_orders_bulk.sql
-- Bulk-create orders for many customers in ONE transaction.
-- Reuses create_order_with_items per element (DRY) so address snapshot,
-- item insert, subtotal, and the initial 'pending' status event stay identical.
-- All-or-nothing: if any element raises, the whole batch rolls back.
--
-- No explicit GRANT: matches the sibling RPC (20260506190022_create_order_with_items_v2.sql)
-- which also omits a grant and relies on security invoker + RLS.

create or replace function create_orders_bulk(
  p_orders   jsonb,
  p_created_by uuid
) returns jsonb
language plpgsql
-- security invoker: runs as the caller; relies on the caller's RLS access to orders/order_items/order_status_events/addresses. Do not switch to security definer.
security invoker
set search_path = public
as $$
declare
  v_elem         jsonb;
  v_order_id     uuid;
  v_order_number text;
  v_results      jsonb := '[]'::jsonb;
  v_count        int;
begin
  v_count := coalesce(jsonb_array_length(p_orders), 0);

  if v_count = 0 then
    raise exception 'bulk order needs at least one order'
      using errcode = 'P0001';
  end if;

  if v_count > 250 then
    raise exception 'bulk order exceeds max batch size (250): %', v_count
      using errcode = 'P0001';
  end if;

  for v_elem in select * from jsonb_array_elements(p_orders)
  loop
    -- Arg order matches create_order_with_items signature exactly:
    -- (p_customer_id, p_scheduled_for, p_time_slot, p_payment_method,
    --  p_delivery_notes, p_delivery_fee_minor, p_created_by, p_items)
    v_order_id := create_order_with_items(
      (v_elem->>'customer_id')::uuid,
      (v_elem->>'scheduled_for')::date,
      nullif(v_elem->>'time_slot', '')::time_slot,
      (v_elem->>'payment_method')::payment_method,
      nullif(v_elem->>'delivery_notes', '')::text,
      coalesce((v_elem->>'delivery_fee_minor')::bigint, 0),
      p_created_by,
      v_elem->'items'
    );

    select order_number into v_order_number
    from orders
    where id = v_order_id;

    v_results := v_results || jsonb_build_object(
      'customer_id',   v_elem->>'customer_id',
      'order_id',      v_order_id,
      'order_number',  v_order_number
    );
  end loop;

  return v_results;
end;
$$;
