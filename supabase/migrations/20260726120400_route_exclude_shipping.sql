-- 20260726120400_route_exclude_shipping
-- Keep cargo (shipping) orders off the daily delivery route.
--
-- An order is route-relevant only if it has at least one DELIVERY-fulfilled
-- item. So:
--   - pure delivery order   → on the route (unchanged)
--   - mixed order           → on the route (its delivery items still need it;
--                             the shipping items ride along)
--   - pure shipping order   → EXCLUDED (fulfilled entirely by cargo)
--
-- Signature is unchanged, so `create or replace` is enough (no drop). Same
-- SECURITY INVOKER + status filter as before; only the WHERE gains the EXISTS.

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
  address_apartment_no text,
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
    a.apartment_no,
    o.delivery_notes,
    o.total_minor
  from orders o
  join customers c on c.id = o.customer_id
  join addresses a on a.customer_id = c.id and a.is_primary
  where o.scheduled_for = target_date
    and o.status in ('pending', 'confirmed', 'delivered')
    and exists (
      select 1
      from order_items oi
      join products p on p.key = oi.product_key
      where oi.order_id = o.id
        and p.fulfillment_type = 'delivery'
    )
  order by o.scheduled_for, o.created_at;
$$;
