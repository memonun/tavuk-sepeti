-- 019_find_orders_for_route_include_delivered
--
-- Driver mode (added in Sprint 5+) needs to keep displaying delivered
-- stops as completed milestones — re-fetching after each transition must
-- not silently drop them from the optimized stop list. We extend the
-- status filter to include 'delivered' alongside 'pending' / 'confirmed'.
--
-- Cancelled orders stay excluded (driver should never see those on the
-- route). Same SECURITY INVOKER + grant pattern as migration 013.

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
    and o.status in ('pending', 'confirmed', 'delivered')
  order by o.scheduled_for, o.created_at;
$$;
