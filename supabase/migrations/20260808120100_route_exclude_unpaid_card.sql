-- 20260808120100_route_exclude_unpaid_card
--
-- WHY: a customer who picks "card" and then closes the PayTR page still leaves
-- a real order behind. place_web_order writes the order BEFORE the redirect
-- (so the payment can reference it), and only the callback marks it paid — so
-- an abandoned or declined card order sits at payment_status = 'pending'.
-- find_orders_for_route filtered on orders.status alone, so that never-paid
-- order was loaded onto the next morning's van like any confirmed one.
--
-- A card order now joins the route only once the money actually arrived.
-- Cash-on-delivery and bank-transfer orders are untouched: for those, 'pending'
-- payment is the normal state right up to the doorstep.
--
-- Deliberately NOT auto-cancelling the abandoned order: a late callback simply
-- makes it eligible again, and nothing irreversible happens to a real customer
-- order because of a webhook timing quirk (CLAUDE.md §1 — pick the conservative
-- option). Admin visibility comes from the same predicate in the orders list.
--
-- Signature is unchanged, so `create or replace` is enough here (unlike
-- 20260805090600, which widened RETURNS TABLE and had to drop first).

create or replace function find_orders_for_route(target_date date)
returns table (
  order_id uuid,
  order_number text,
  status order_status,
  scheduled_for date,
  time_slot time_slot,
  customer_id uuid,
  customer_first_name text,
  customer_last_name text,
  customer_phone text,
  address_lat double precision,
  address_lng double precision,
  address_street text,
  address_building_no text,
  address_apartment_no text,
  in_service_area boolean,
  delivery_notes text,
  total_minor bigint
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    o.id,
    o.order_number,
    o.status,
    o.scheduled_for,
    o.time_slot,
    c.id,
    c.first_name,
    c.last_name,
    c.phone,
    a.lat,
    a.lng,
    a.street,
    a.building_no,
    a.apartment_no,
    is_within_service_area(a.lat, a.lng),
    o.delivery_notes,
    o.total_minor
  from orders o
  join customers c on c.id = o.customer_id
  join addresses a on a.id = o.address_id
  where o.scheduled_for = target_date
    and o.status in ('pending', 'confirmed', 'delivered')
    and o.fulfillment_channel = 'delivery'
    -- Card orders ride only when paid. Any other method keeps its old
    -- behaviour, including 'pending' (that IS cash-on-delivery's steady state).
    and not (o.payment_method = 'credit_card' and o.payment_status <> 'paid')
  order by o.scheduled_for, o.created_at;
$$;

comment on function find_orders_for_route is
  'Stops for a day''s delivery route. Frozen facts only: the order''s own address_id and its frozen fulfillment_channel. Excludes card orders that have not been paid — an abandoned PayTR checkout must not reach the van.';
