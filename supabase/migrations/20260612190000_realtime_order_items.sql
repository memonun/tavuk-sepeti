-- 035_realtime_order_items
--
-- Enables Supabase Realtime broadcasts for order_items so the routing view's
-- per-stop content (line items / quantities / products) updates live when an
-- order is edited while a driver is on the road. orders + customers are already
-- published (027_realtime_orders, realtime_customers); this adds the missing
-- table the route view reads its item detail from.
--
-- RLS: postgres_changes is RLS-aware. order_items already carries the
-- admin-only policy (order_items_admin_all), so a non-admin subscriber gets an
-- empty stream. Ref:
-- https://supabase.com/docs/guides/realtime/postgres-changes#row-level-security
--
-- Idempotency: gate on pg_publication_tables (lookup-then-add), matching
-- 20260608120001_realtime_orders.sql — ALTER PUBLICATION's duplicate SQLSTATE
-- isn't stable across Postgres versions.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end $$;
