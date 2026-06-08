-- Aggregate order counts per customer for the bulk-delete pre-check.
-- security invoker → RLS applies (admin sees all). Single round-trip,
-- exact counts, no PostgREST max-rows truncation (CLAUDE.md §1/§9).
create or replace function public.count_orders_by_customers(p_customer_ids uuid[])
returns table (customer_id uuid, order_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select o.customer_id, count(*)::bigint as order_count
  from public.orders o
  where o.customer_id = any(p_customer_ids)
  group by o.customer_id;
$$;
