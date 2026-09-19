-- 20260919120000_home_delivery_fee_setting
--
-- The 50,00 ₺ flat fee on a hand-delivered (Malatya-içi) order was a TS constant
-- (DELIVERY_FEE_MINOR) mirrored by a literal 5000 inside create_recurring_order —
-- changeable only by a deploy, and never applied to orders the staff key in from
-- the admin panel. The owner wants to (a) change the amount from
-- /magaza-ayarlari and (b) have staff-entered orders carry it too.
--
-- 1. storefront_settings.home_delivery_fee_minor — the single owner-editable
--    amount. Default 5000 = today's constant, so behaviour is unchanged until
--    the owner edits it. The table's existing RLS (public read, admin write)
--    covers the new column; no new grant is needed for an added column.
-- 2. create_recurring_order reads that setting instead of the literal 5000.
--    Body-only change: the signature is byte-identical to 20260908120000's, so
--    `create or replace` keeps every grant and no old caller is affected.
-- 3. create_orders_bulk (admin entry) learns an OPTIONAL per-order flag,
--    `delivery_fee_only_if_delivery`. When true, the order keeps its fee only if
--    the channel the DB resolved is 'delivery'; a cargo-channel order is zeroed.
--    The channel is decided per order in create_order_with_items (address +
--    items), which the client cannot know, so the gate has to live here. Absent
--    flag = the old behaviour, so a client deployed before this migration keeps
--    working (signature unchanged: still (jsonb, uuid)).

alter table storefront_settings
  add column if not exists home_delivery_fee_minor bigint not null default 5000
    check (home_delivery_fee_minor >= 0);

comment on column storefront_settings.home_delivery_fee_minor is
  'Flat fee (kuruş) added to a delivery-channel (eve servis) order — storefront checkout, recurring generator and, by default, staff-entered orders. 0 = free delivery. Cargo orders are never charged this.';

-- ---- create_orders_bulk: gate the fee on the resolved channel ---------------
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

    -- The fee is meant for a hand-delivered order only. The channel was frozen
    -- on the row by create_order_with_items just above, so read it back rather
    -- than re-resolving.
    if coalesce((v_elem->>'delivery_fee_only_if_delivery')::boolean, false) then
      update orders
         set delivery_fee_minor = 0
       where id = v_order_id
         and fulfillment_channel <> 'delivery';
    end if;

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

-- ---- create_recurring_order: fee comes from the setting ---------------------
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
  v_fee         bigint;
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

  -- coalesce → 5000: the row is seeded, but an unreadable/missing one must not
  -- silently make the recurring run free.
  select coalesce(
           (select home_delivery_fee_minor from storefront_settings where id),
           5000
         )
    into v_fee;

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
      -- storefront_settings.home_delivery_fee_minor; cargo recurring orders pay nothing.
      case when v_channel = 'delivery' then v_fee else 0 end,
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
