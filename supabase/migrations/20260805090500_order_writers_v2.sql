-- 20260805090500_order_writers_v2
--
-- WHY: orders.address_id and orders.fulfillment_channel are both NOT NULL as of
-- the previous two migrations, so EVERY order writer must set them — in the same
-- deploy. There are four:
--
--   create_order_with_items   (admin, via create_orders_bulk)
--   update_order_with_items   (admin order editor — items change ⇒ channel changes)
--   create_recurring_order    (the cron/materialize path — easy to forget)
--   place_web_order           (storefront)
--
-- All four now share address_snapshot(addresses) and the resolve_*_channel()
-- helpers, so an admin order and a web order for the same customer+address+items
-- differ only in `source` and `created_by`. That shared-definition property is
-- the parity guarantee the owner asked for; it cannot drift because there is
-- only one definition to drift from.
--
-- The three admin/recurring writers keep their exact signatures and their exact
-- observable behaviour — the channel they compute is the same predicate
-- find_orders_for_route used to evaluate at query time.

-- ============================================================================
-- 1. create_order_with_items — signature unchanged
-- ============================================================================
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
  v_subtotal bigint := 0;
  v_address_row addresses%rowtype;
  v_total_count int;
  v_channel fulfillment_channel;
begin
  select * into v_address_row
  from addresses a
  where a.customer_id = p_customer_id and a.is_primary
  limit 1;

  if not found then
    raise exception 'customer % has no primary address', p_customer_id
      using errcode = 'P0001';
  end if;

  select count(*) into v_total_count from jsonb_array_elements(p_items);
  if v_total_count = 0 then
    raise exception 'order needs at least one item' using errcode = 'P0001';
  end if;

  v_channel := resolve_channel_for_items(p_items);

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
    customer_id, address_id, scheduled_for, time_slot, payment_method, delivery_notes,
    subtotal_minor, delivery_fee_minor, delivery_address_snapshot, created_by, source,
    fulfillment_channel
  ) values (
    p_customer_id, v_address_row.id, p_scheduled_for, p_time_slot, p_payment_method,
    p_delivery_notes, v_subtotal, coalesce(p_delivery_fee_minor, 0),
    address_snapshot(v_address_row), p_created_by, 'admin_manual', v_channel
  )
  returning id into v_order_id;

  -- fulfillment_type is looked up from `products`, never taken from the caller's
  -- jsonb — a client cannot talk its way onto (or off) the route.
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
    product_key text,
    quantity numeric,
    unit_price_minor bigint,
    line_total_minor bigint,
    product_snapshot jsonb
  )
  left join products p on p.key = x.product_key;

  insert into order_status_events (order_id, from_status, to_status, actor_id)
  values (v_order_id, null, 'pending', p_created_by);

  return v_order_id;
end;
$$;

-- ============================================================================
-- 2. update_order_with_items — signature unchanged
-- ============================================================================
-- An edit that removes the last delivery line moves the order to the cargo
-- channel, and one that adds a delivery line moves it back. That is exactly what
-- the live EXISTS clause does today, so editing behaviour is preserved.
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
    order_id, product_key, quantity, unit_price_minor, line_total_minor,
    product_snapshot, fulfillment_type
  )
  select
    p_order_id, x.product_key, x.quantity, x.unit_price_minor,
    coalesce(x.line_total_minor, (x.quantity * x.unit_price_minor)::bigint),
    x.product_snapshot,
    coalesce(p.fulfillment_type, 'delivery')
  from jsonb_to_recordset(p_items) as x(
    product_key text,
    quantity numeric,
    unit_price_minor bigint,
    line_total_minor bigint,
    product_snapshot jsonb
  )
  left join products p on p.key = x.product_key;

  -- Re-freeze the channel from the NEW item set.
  update orders set fulfillment_channel = resolve_order_channel(p_order_id)
  where id = p_order_id;
end;
$$;

-- ============================================================================
-- 3. create_recurring_order — signature unchanged
-- ============================================================================
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

  -- Idempotency pre-check (avoids hitting the unique index on the happy path).
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

  v_channel := resolve_channel_for_items(p_items);

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
      null,                       -- no slot on recurring-generated orders
      v_tpl.payment_method,       -- from the template, not a caller parameter
      null,
      v_subtotal,
      0,
      address_snapshot(v_address_row),
      p_created_by,
      'recurring_generated',
      p_template_id,
      v_channel
    )
    returning id into v_order_id;

    -- line_total_minor is now written explicitly. It used to be omitted here,
    -- and since migration 20260611140100 dropped the generated expression (default
    -- 0), every recurring order line has been stored with a ZERO line total —
    -- visible as ₺0,00 in the order panel and the driver's stop list. The value
    -- written matches the subtotal this function already computes, so no order
    -- total changes.
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

-- ============================================================================
-- 4. place_web_order — NEW SIGNATURE (drop + create)
-- ============================================================================
-- The old signature took p_first_name / p_last_name / p_phone / p_email and
-- upserted `customers` BY PHONE. That upsert is precisely the legacy-matching
-- machinery the owner outlawed, and it is why the web writer looked nothing like
-- the admin one.
--
-- Taking p_customer_id + p_address_id instead IS the parity fix: the web writer
-- now has the same precondition as the admin writer ("hand me a customer that
-- exists, with an address"), and "which customer is this?" lives in exactly one
-- place — link_customer_account.
drop function if exists place_web_order(
  text, text, text, text, jsonb, date, time_slot, payment_method, text, bigint, jsonb, uuid
);
drop function if exists place_web_order(
  text, text, text, text, jsonb, date, time_slot, payment_method, text, bigint, jsonb
);

create function place_web_order(
  p_customer_id        uuid,
  p_address_id         uuid,
  p_scheduled_for      date,
  p_time_slot          time_slot,
  p_payment_method     payment_method,
  p_delivery_notes     text,
  p_delivery_fee_minor bigint,
  p_items              jsonb
-- The OUT column and the enum share a name, so every type reference inside this
-- function is schema-qualified — an unqualified `fulfillment_channel` in a type
-- position would resolve to the OUT variable and fail to compile.
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
  select count(*) into v_item_count from jsonb_array_elements(p_items);
  if v_item_count = 0 then
    raise exception 'order needs at least one item' using errcode = 'P0001';
  end if;

  if not exists (select 1 from customers where id = p_customer_id) then
    raise exception 'customer % not found', p_customer_id using errcode = 'P0002';
  end if;

  -- IDOR guard: the address must belong to THIS customer. Without it, a crafted
  -- request could deliver someone else's order to an attacker's address.
  select * into v_address_row
  from addresses a
  where a.id = p_address_id and a.customer_id = p_customer_id;
  if not found then
    raise exception 'address % does not belong to customer %', p_address_id, p_customer_id
      using errcode = 'P0004';
  end if;

  v_channel := resolve_channel_for_items(p_items);

  if v_channel = 'delivery' then
    -- Route-grade address: exactly the fields missingDeliveryFields checks.
    if coalesce(trim(v_address_row.street), '') = ''
       or coalesce(trim(v_address_row.apartment_no), '') = '' then
      raise exception 'route order needs street and apartment_no' using errcode = 'P0006';
    end if;

    -- NULL = no zone configured; the application layer already logged a warning
    -- and fell back to a province-name compare, so only an explicit `false`
    -- blocks the write here.
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
    fulfillment_channel
  ) values (
    p_customer_id, v_address_row.id, p_scheduled_for, p_time_slot, p_payment_method,
    p_delivery_notes, v_subtotal, coalesce(p_delivery_fee_minor, 0),
    address_snapshot(v_address_row), null, 'customer_web', v_channel
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

  -- Placed by the customer — no admin actor.
  insert into order_status_events (order_id, from_status, to_status, actor_id)
  values (v_order_id, null, 'pending', null);

  return query select v_order_id, v_order_number, v_channel;
end;
$$;

comment on function place_web_order is
  'Storefront checkout writer. Same precondition as create_order_with_items (an existing customer + an existing address) and the same address_snapshot; differs only in source=customer_web and created_by=null. Never looks a customer up by phone. Guards: P0002 customer, P0004 address ownership, P0006 route address completeness, P0007 outside service area. SECURITY DEFINER; service_role only.';

revoke all on function place_web_order(uuid, uuid, date, time_slot, payment_method, text, bigint, jsonb) from public;
revoke all on function place_web_order(uuid, uuid, date, time_slot, payment_method, text, bigint, jsonb) from anon, authenticated;
grant execute on function place_web_order(uuid, uuid, date, time_slot, payment_method, text, bigint, jsonb) to service_role;
