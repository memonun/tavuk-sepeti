-- 20260813130000_address_aware_channel
--
-- WHY: `resolve_channel_for_items` decided delivery vs. shipping from the
-- BASKET alone — a cart of only cargo-capable goods (kayısı, kuru dut) always
-- became a shipping order, even for a customer whose saved address is inside
-- Malatya with a confirmed door-level pin. The van could have carried it, the
-- customer just never got the eve-servis price/floor/kapıda-ödeme treatment,
-- because the resolver never looked at the address at all.
--
-- Owner decision 2026-08-13: if flexible goods are the only thing in the
-- basket AND the target address can genuinely take a route delivery, treat
-- it exactly like a mixed basket already is — one delivery order, cargo-able
-- goods riding along in the van. A basket with an actual delivery-only line
-- (yumurta) is unaffected; it was already 'delivery' and stays that way.
--
-- "Can genuinely take a route delivery" mirrors is_route_capable in
-- route-capability.ts, but STRICTER than the UI hint that module exports:
--   1. geo_verified — a real PostGIS "inside the service area" hit at save
--      time, not a same-province guess. Unconfigured/outside never upgrades;
--      when unsure, the conservative answer is "still shipping" (CLAUDE.md §1).
--   2. street + apartment_no filled in — a route stop needs a door, and this
--      is exactly what place_web_order's P0006 guard already requires of a
--      basket that HAD to be delivery. Applying the same bar to an upgrade
--      keeps the two paths consistent instead of upgrading into an order the
--      driver can't actually find.
--
-- Scope: all four order writers share this resolver, so the fix applies
-- everywhere an order is created — the storefront, the admin manual-entry
-- screen, and the recurring-order cron — not just the customer checkout.
--
-- Also adds `home_min_order_minor` (eve servis alt limiti) to
-- storefront_settings, owner-editable the same way cargo_min_order_minor is.
-- 250 ₺ at launch — the app layer enforces it (same posture as the cargo
-- floor: a UX rule, not a DB constraint, since it depends on money already
-- computed from re-priced items).

-- ---- storefront_settings: eve servis alt limiti ----------------------------
alter table storefront_settings
  add column if not exists home_min_order_minor bigint not null default 25000
    check (home_min_order_minor >= 0);

comment on column storefront_settings.home_min_order_minor is
  'Minimum subtotal (kuruş) for a delivery-channel (eve servis) order, including a basket upgraded from shipping by an address-aware channel resolution. 0 = no minimum.';

-- ---- Address route-capability, as SQL can see it ----------------------------
-- Single definition shared by resolve_channel_for_items and
-- resolve_order_channel so the two can never disagree.
create or replace function is_route_capable_address(a addresses)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.lat is not null and a.lng is not null
    and not (a.lat = 0 and a.lng = 0)
    and coalesce(trim(a.street), '') <> ''
    and coalesce(trim(a.apartment_no), '') <> ''
    and is_within_service_area(a.lat, a.lng) is true;
$$;

comment on function is_route_capable_address is
  'True only on a confirmed pin (via PostGIS is_within_service_area, not a province-name guess) with street + apartment_no filled in. The address-aware half of resolve_channel_for_items / resolve_order_channel — an unconfigured or outside-area zone never returns true here.';

-- ---- Pre-insert resolver: now address-aware ---------------------------------
drop function if exists resolve_channel_for_items(jsonb);

create or replace function resolve_channel_for_items(
  p_items   jsonb,
  p_address addresses
) returns fulfillment_channel
language sql
stable
security invoker
set search_path = public
as $$
  select case
    -- Owner decision 2026-08-05: any delivery-fulfilled line makes the whole
    -- basket one route order, address aside.
    when exists (
      select 1
      from jsonb_to_recordset(p_items) as x(product_key text)
      join products p on p.key = x.product_key
      where p.fulfillment_type = 'delivery'
    ) then 'delivery'::fulfillment_channel
    -- Owner decision 2026-08-13: no delivery-only line, but this address can
    -- genuinely take a route delivery — upgrade rather than ship.
    when is_route_capable_address(p_address) then 'delivery'::fulfillment_channel
    else 'shipping'::fulfillment_channel
  end;
$$;

-- ---- Post-write resolver (order edits): now address-aware -------------------
create or replace function resolve_order_channel(p_order_id uuid)
returns fulfillment_channel
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when exists (
      select 1 from order_items oi
      where oi.order_id = p_order_id and oi.fulfillment_type = 'delivery'
    ) then 'delivery'::fulfillment_channel
    when exists (
      select 1
      from orders o
      join addresses a on a.id = o.address_id
      where o.id = p_order_id and is_route_capable_address(a)
    ) then 'delivery'::fulfillment_channel
    else 'shipping'::fulfillment_channel
  end;
$$;

-- ============================================================================
-- Writers — signatures unchanged, only the resolve_channel_for_items call
-- site changes (now passes the address row each already looks up).
-- ============================================================================

-- ---- 1. create_order_with_items ---------------------------------------------
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

  v_channel := resolve_channel_for_items(p_items, v_address_row);

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

-- ---- 2. create_recurring_order -----------------------------------------------
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

  v_channel := resolve_channel_for_items(p_items, v_address_row);

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
      0,
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

-- ---- 3. place_web_order -------------------------------------------------------
create or replace function place_web_order(
  p_customer_id        uuid,
  p_address_id         uuid,
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

  select * into v_address_row
  from addresses a
  where a.id = p_address_id and a.customer_id = p_customer_id;
  if not found then
    raise exception 'address % does not belong to customer %', p_address_id, p_customer_id
      using errcode = 'P0004';
  end if;

  v_channel := resolve_channel_for_items(p_items, v_address_row);

  if v_channel = 'delivery' then
    -- Still required even for an address-upgraded order: a route stop needs a
    -- door. A basket with an actual delivery-only line demands this too, same
    -- as before this migration.
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

  insert into order_status_events (order_id, from_status, to_status, actor_id)
  values (v_order_id, null, 'pending', null);

  return query select v_order_id, v_order_number, v_channel;
end;
$$;

comment on function place_web_order is
  'Storefront checkout writer. Same precondition as create_order_with_items (an existing customer + an existing address) and the same address_snapshot; differs only in source=customer_web and created_by=null. Channel resolution is address-aware (resolve_channel_for_items): a flexible-only basket upgrades to delivery when the address is route-capable. Guards: P0002 customer, P0004 address ownership, P0006 route address completeness, P0007 outside service area. SECURITY DEFINER; service_role only.';
