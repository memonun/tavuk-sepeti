-- 20260819200000_relax_admin_route_capable_address
--
-- BUG: a hand-delivery order placed by staff (admin_manual / recurring) for a
-- basket with NO delivery-only line (e.g. only "Sarı Kuru Kayısı") silently
-- became 'shipping' and vanished from the Routes tab whenever the customer's
-- saved address had no `apartment_no` — which is common for staff-entered
-- addresses, since the admin form treats street/building_no/apartment_no as
-- fully optional (raw_text already carries everything a human needs). Adding
-- an actual delivery-type item (yumurta) "fixed" it only because that branch
-- of resolve_channel_for_items/resolve_order_channel skips the address check
-- entirely — the address-upgrade branch was the only one gated on
-- apartment_no, and staff never gets a warning that it silently fell back to
-- shipping.
--
-- Confirmed on production: ORD-2026-00438 and ORD-2026-00483, both
-- geographically inside the Malatya service area (is_within_service_area =
-- true) with street/apartment_no = null, both stuck on 'shipping'.
--
-- FIX: staff-entered orders (create_order_with_items, create_recurring_order,
-- and order edits via resolve_order_channel) no longer require apartment_no
-- to upgrade a flexible-only basket to the route — only a confirmed pin
-- inside the service area and a street line. The storefront
-- (place_web_order / place_guest_order) is UNCHANGED: a self-service
-- customer still must supply street + apartment_no, same as its P0006 guard
-- already demands. A route stop missing "Daire" still shows the red warning
-- chip on the route page (features/routing/domain/delivery-readiness.ts) —
-- this migration only decides whether the stop is on the list, not whether
-- it's flagged.

-- ---- is_route_capable_address: apartment_no now optional for staff callers -
-- Same-name replace with an added trailing default arg would create an
-- ambiguous overload against the existing 1-arg definition, so drop first.
drop function if exists is_route_capable_address(addresses);

create function is_route_capable_address(
  a addresses,
  p_require_apartment boolean default true
) returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.lat is not null and a.lng is not null
    and not (a.lat = 0 and a.lng = 0)
    and coalesce(trim(a.street), '') <> ''
    and (not p_require_apartment or coalesce(trim(a.apartment_no), '') <> '')
    and is_within_service_area(a.lat, a.lng) is true;
$$;

comment on function is_route_capable_address is
  'True on a confirmed pin (via PostGIS is_within_service_area) with a street line. apartment_no is required unless p_require_apartment=false — staff-entered orders (resolve_channel_for_items p_relaxed_address=true, resolve_order_channel) relax it since the admin address form leaves apartment_no optional; the storefront keeps it required via its default.';

-- ---- resolve_channel_for_items: staff callers can opt into the relaxed check
drop function if exists resolve_channel_for_items(jsonb, addresses);

create function resolve_channel_for_items(
  p_items          jsonb,
  p_address        addresses,
  p_relaxed_address boolean default false
) returns fulfillment_channel
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when exists (
      select 1
      from jsonb_to_recordset(p_items) as x(product_key text)
      join products p on p.key = x.product_key
      where p.fulfillment_type = 'delivery'
    ) then 'delivery'::fulfillment_channel
    when is_route_capable_address(p_address, not p_relaxed_address)
      then 'delivery'::fulfillment_channel
    else 'shipping'::fulfillment_channel
  end;
$$;

comment on function resolve_channel_for_items is
  'Pre-insert channel resolver shared by every order writer. p_relaxed_address=true (staff writers only: create_order_with_items, create_recurring_order) drops the apartment_no requirement on the address-upgrade branch; place_web_order/place_guest_order keep the default strict check.';

-- ---- resolve_order_channel: order edits are always staff-initiated ---------
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
      where o.id = p_order_id and is_route_capable_address(a, false)
    ) then 'delivery'::fulfillment_channel
    else 'shipping'::fulfillment_channel
  end;
$$;

comment on function resolve_order_channel is
  'Post-write channel resolver used only by update_order_with_items (the admin order editor) — always a staff context, so the address-upgrade branch always uses the relaxed (apartment_no-optional) check, same as create_order_with_items.';

-- ---- create_order_with_items: pass the relaxed flag ------------------------
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

  v_channel := resolve_channel_for_items(p_items, v_address_row, true);

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

-- ---- create_recurring_order: pass the relaxed flag -------------------------
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
