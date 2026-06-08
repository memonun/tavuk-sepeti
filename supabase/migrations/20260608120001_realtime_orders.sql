-- 027_realtime_orders
--
-- Enables Supabase Realtime broadcasts for the orders + order_status_events
-- tables so admin grids can show cell-level live updates when a peer
-- mutates a row.
--
-- RLS: postgres_changes IS RLS-aware. The existing admin-only RLS policies
-- on these tables gate which row events each subscriber sees — an anon or
-- non-admin client subscribing to the channel receives an empty stream.
-- order_status_events is included so a status transition (which writes an
-- event row) also nudges the grid without a separate orders row mutation.
-- Ref: https://supabase.com/docs/guides/realtime/postgres-changes#row-level-security
--
-- Idempotency: gate on pg_publication_tables instead of swallowing
-- SQLSTATE. The historical "duplicate_object" code isn't stable across
-- Postgres versions for ALTER PUBLICATION; the lookup-then-add pattern
-- is what Supabase recommends (mirrors 20260525120000_realtime_customers.sql).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_status_events'
  ) then
    alter publication supabase_realtime add table public.order_status_events;
  end if;
end $$;

-- payment_status becomes a grid sort/filter target; index it so sorting a
-- large orders list stays index-backed (CLAUDE.md §1 paranoid-scale).
create index if not exists orders_payment_status_idx on public.orders (payment_status);
