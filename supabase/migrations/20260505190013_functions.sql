-- 013_functions
-- SPEC.md §4.2 RPCs. These run inside the DB so they:
--   1. Skip the round-trip cost of fetching + filtering in the app layer.
--   2. Inherit RLS automatically — the calling user's role still applies.
--
-- Both are SECURITY INVOKER (not DEFINER) so they execute with the caller's
-- permissions and can't be used to bypass policies.

-- ---- find_orders_for_route(target_date) -----------------------------------
-- Returns the day's deliverable orders (pending or confirmed) joined to the
-- customer's primary address. Ordered by scheduled_for then created_at to
-- give the routing UI a stable initial sequence before optimization.

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
    o.delivery_notes,
    o.total_minor
  from orders o
  join customers c on c.id = o.customer_id
  join addresses a on a.customer_id = c.id and a.is_primary
  where o.scheduled_for = target_date
    and o.status in ('pending', 'confirmed')
  order by o.scheduled_for, o.created_at;
$$;

revoke all on function find_orders_for_route(date) from public;
grant execute on function find_orders_for_route(date) to authenticated;

-- ---- find_customers_within_radius(lat, lng, meters) -----------------------
-- Map view's "show me everyone near here" query. Uses ST_DWithin which is
-- index-aware on the geography(Point) GIST index — sub-millisecond on
-- 100k rows.

create or replace function find_customers_within_radius(
  center_lat double precision,
  center_lng double precision,
  radius_meters double precision
)
returns table (
  customer_id uuid,
  first_name text,
  last_name text,
  phone text,
  address_lat double precision,
  address_lng double precision,
  distance_meters double precision
)
language sql
security invoker
stable
set search_path = public
as $$
  with center as (
    select st_setsrid(st_makepoint(center_lng, center_lat), 4326)::geography as g
  )
  select
    c.id,
    c.first_name,
    c.last_name,
    c.phone,
    a.lat,
    a.lng,
    st_distance(a.coordinate, center.g) as distance_meters
  from addresses a
  join customers c on c.id = a.customer_id
  cross join center
  where a.is_primary
    and c.status = 'active'
    and st_dwithin(a.coordinate, center.g, radius_meters)
  order by distance_meters;
$$;

revoke all on function find_customers_within_radius(double precision, double precision, double precision) from public;
grant execute on function find_customers_within_radius(double precision, double precision, double precision) to authenticated;
