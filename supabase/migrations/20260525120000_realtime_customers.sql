-- 026_realtime_customers
--
-- Enables Supabase Realtime broadcasts for the customers + addresses
-- tables so admin grids can show cell-level live updates when a peer
-- mutates a row.
--
-- RLS still applies on the broadcast path: only rows the receiving
-- client could SELECT under its own session get delivered. The
-- existing admin-only RLS policies on these tables are sufficient.
--
-- Idempotent guard: a re-run after a fresh `supabase db reset` would
-- otherwise error with "relation already in publication". The
-- exception-swallowing block matches the pattern used elsewhere when
-- adding tables to a publication that may or may not already include
-- them.

do $$
begin
  alter publication supabase_realtime add table customers;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table addresses;
exception
  when duplicate_object then null;
end $$;
