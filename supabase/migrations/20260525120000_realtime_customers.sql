-- 026_realtime_customers
--
-- Enables Supabase Realtime broadcasts for the customers + addresses
-- tables so admin grids can show cell-level live updates when a peer
-- mutates a row.
--
-- RLS: postgres_changes IS RLS-aware (unlike Realtime Broadcast /
-- Presence which need separate realtime.messages policies). The
-- existing admin-only RLS policies on these tables therefore gate
-- which row events each subscriber sees — an anon or non-admin client
-- subscribing to the channel receives an empty stream.
-- Ref: https://supabase.com/docs/guides/realtime/postgres-changes#row-level-security
--
-- Idempotency: gate on pg_publication_tables instead of swallowing
-- SQLSTATE. The historical "duplicate_object" code isn't stable
-- across Postgres versions for ALTER PUBLICATION; the lookup-then-add
-- pattern is what Supabase recommends.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customers'
  ) then
    alter publication supabase_realtime add table public.customers;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'addresses'
  ) then
    alter publication supabase_realtime add table public.addresses;
  end if;
end $$;
