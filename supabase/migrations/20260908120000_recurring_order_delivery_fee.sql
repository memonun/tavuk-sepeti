-- 20260908120000_recurring_order_delivery_fee
--
-- The owner added a flat 50,00 ₺ fee to Malatya-içi hand-delivered orders
-- (DELIVERY_FEE_MINOR in features/storefront/domain/storefront.config.ts).
-- The customer checkout applies it in place-order.ts; create_recurring_order
-- is the other writer that produces hand-delivery orders (the materialize
-- cron), and it was inserting delivery_fee_minor = 0 unconditionally.
--
-- Bring it in line: charge the same fee when the resolved channel is
-- "delivery", nothing on a cargo-channel recurring order. Body-only change —
-- the signature is byte-identical to 20260819200000's, so `create or replace`
-- keeps every existing grant and no old caller is affected (this RPC never
-- took a fee argument; the value is decided here).
--
-- 5000 is duplicated from storefront.config.ts on purpose (an in-DB writer
-- cannot import the TS constant); the config comment points back here so the
-- two are changed together.

create or replace function create_recurring_order(
  p_template_id   uuid,
  p_scheduled_for date,
  p_created_by    uuid,
  p_items         jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id    uuid;
  v_existing    uuid;
  v_tpl         recurring_templates%rowtype;
  v_address_row addresses%rowtype;
  v_subtotal    bigint := 0;
  v_channel     fulfillment_channel;
begin
  select * into v_tpl from recurring_templates where id = p_template_id;
  if not found then
    raise exception 'recurring template % not found', p_template_id using errcode = 'P0001';
  end if;
  if not v_tpl.active then
    raise exception 'recurring template % is not active', p_template_id using errcode = 'P0001';
  end if;

  select id into v_existing
  from orders
  where recurring_template_id = p_template_id
    and scheduled_for          = p_scheduled_for
    and source                 = 'recurring_generated'
  limit 1;
  if found then
    return v_existing;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'recurring order needs at least one item' using errcode = 'P0001';
  end if;

  select * into v_address_row
  from addresses a
  where a.customer_id = v_tpl.customer_id and a.is_primary
  limit 1;
  if not found then
    raise exception 'customer % has no primary address', v_tpl.customer_id
      using errcode = 'P0001';
  end if;

  v_channel := resolve_channel_for_items(p_items, v_address_row, true);

  select coalesce(sum((x.quantity * x.unit_price_minor)::bigint), 0)
    into v_subtotal
  from jsonb_to_recordset(p_items) as x(
    quantity         numeric,
    unit_price_minor bigint
  );

  begin
    insert into orders (
      customer_id, address_id, scheduled_for, time_slot, payment_method, delivery_notes,
      subtotal_minor, delivery_fee_minor, delivery_address_snapshot, created_by, source,
      recurring_template_id, fulfillment_channel
    ) values (
      v_tpl.customer_id, v_address_row.id, p_scheduled_for,
      null,
      v_tpl.payment_method,
      null,
      v_subtotal,
      -- 5000 = DELIVERY_FEE_MINOR (storefront.config.ts); cargo recurring orders pay nothing.
      case when v_channel = 'delivery' then 5000 else 0 end,
      address_snapshot(v_address_row),
      p_created_by,
      'recurring_generated',
      p_template_id,
      v_channel
    )
    returning id into v_order_id;

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
      product_key      text,
      quantity         numeric,
      unit_price_minor bigint,
      line_total_minor bigint,
      product_snapshot jsonb
    )
    left join products p on p.key = x.product_key;

    insert into order_status_events (order_id, from_status, to_status, actor_id)
    values (v_order_id, null, 'pending', p_created_by);

  exception when unique_violation then
    select id into v_order_id
    from orders
    where recurring_template_id = p_template_id
      and scheduled_for          = p_scheduled_for
      and source                 = 'recurring_generated'
    limit 1;
    return v_order_id;
  end;

  return v_order_id;
end;
$$;
