-- 016_get_customer_pins_rpc
--
-- Map view query: every active customer's primary-address pin, optionally
-- annotated with whether they ordered in the last 30 days. One JOIN +
-- EXISTS instead of an N+1 in the app layer.
--
-- SECURITY INVOKER so the caller's role still gates access — RLS policies
-- apply.

create or replace function get_customer_pins(filter_recent_orders boolean default false)
returns table (
  customer_id uuid,
  first_name text,
  last_name text,
  phone text,
  status customer_status,
  lat double precision,
  lng double precision,
  has_recent_order boolean
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    c.id,
    c.first_name,
    c.last_name,
    c.phone,
    c.status,
    a.lat,
    a.lng,
    exists (
      select 1
      from orders o
      where o.customer_id = c.id
        and o.created_at > now() - interval '30 days'
    ) as has_recent_order
  from customers c
  join addresses a on a.customer_id = c.id and a.is_primary
  where c.status = 'active'
    and (
      filter_recent_orders = false
      or exists (
        select 1
        from orders o
        where o.customer_id = c.id
          and o.created_at > now() - interval '30 days'
      )
    );
$$;

revoke all on function get_customer_pins(boolean) from public;
grant execute on function get_customer_pins(boolean) to authenticated;
