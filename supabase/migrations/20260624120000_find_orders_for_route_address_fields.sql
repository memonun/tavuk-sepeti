-- 20260624120000_find_orders_for_route_address_fields
--
-- The route page warns when a stop is missing the data a driver needs at the
-- door: phone, açık adres (street line), daire (apartment no), and the pin.
-- Phone + lat/lng already come back; this adds the two address-detail columns
-- (street, apartment_no) so the readiness check runs off the SAME single
-- batched query — no per-stop address round trip (CLAUDE.md §9 N+1 yasak).
--
-- RETURNS TABLE signature changes, so `create or replace` can't widen it —
-- drop then recreate. The function has no DB-object dependents (called only
-- via supabase.rpc from the app), so the drop is safe. Same SECURITY INVOKER
-- + grant-by-default pattern as migration 019; status filter unchanged.

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
  order by o.scheduled_for, o.created_at;
$$;
