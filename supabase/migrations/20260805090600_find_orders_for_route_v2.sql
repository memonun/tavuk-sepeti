-- 20260805090600_find_orders_for_route_v2
--
-- WHY: two changes, both making the route read frozen facts instead of deriving
-- them from live rows at query time.
--
--   1. Join `addresses` on the ORDER's own address_id, not on the customer's
--      current primary address. An order now goes where it was ordered to, and
--      an order can no longer disappear because its customer lost a primary row
--      (address_id is NOT NULL).
--   2. Filter on the frozen orders.fulfillment_channel instead of re-deriving
--      membership from the CURRENT products.fulfillment_type. Flipping a product
--      to 'shipping' no longer retroactively empties a past or pending route.
--
-- Also returns two new columns the route UI needs:
--   address_building_no — shown on the driver's stop card next to the daire
--   in_service_area     — true / false / NULL(unconfigured), drives the new
--                         "Bölge dışı" readiness chip
--
-- RETURNS TABLE widens, so `create or replace` can't do it — drop and recreate.
-- The function has no DB-object dependents (called only via supabase.rpc), same
-- as migration 20260624120000 did.

drop function if exists find_orders_for_route(date);

create function find_orders_for_route(target_date date)
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
  order by o.scheduled_for, o.created_at;
$$;
