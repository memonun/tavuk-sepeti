-- 20260820100000_finance_and_routing_grants
--
-- Every table/function created in this project's early migrations
-- (orders, customers, products, ...) has SELECT/INSERT/UPDATE/DELETE and
-- EXECUTE granted to `authenticated` implicitly — but every table/function
-- created SINCE (expenses, market_locations, market_sales,
-- market_sale_items, all finance_* RPCs, set_order_eta_batch) came back
-- with only TRUNCATE/REFERENCES/TRIGGER on tables and NO execute at all on
-- functions, discovered via `permission denied for table market_sales`
-- (Postgres 42501) against the local Supabase CLI stack while testing the
-- Pazar Lokasyonları management UI.
--
-- Root cause: this project's Postgres has a default-ACL rule scoped to
-- `role postgres` (the role `supabase db push`/migrations run as) that is
-- markedly more restrictive than whatever created the original schema
-- objects — `pg_default_acl` shows role postgres's default for new tables
-- is `Dxtm` (truncate/references/trigger/maintain only, no DML) and for new
-- functions is execute-to-postgres-only (no PUBLIC execute, unlike
-- Postgres's normal CREATE FUNCTION default). RLS + `is_admin()` still gate
-- actual row access correctly once these grants exist — GRANT is
-- necessary-but-not-sufficient, not a bypass.
--
-- This did not surface against production because production's default
-- privileges are evidently more permissive (the owner's own screenshot of
-- /finans/pazar-satislari live on apuhanciftligi.com shows it working) —
-- but relying on an unexplained platform-level default that already
-- diverges between environments is exactly the kind of thing CLAUDE.md §1's
-- "paranoyak karar mekanizması" says not to do. Explicit grants here make
-- every environment behave the same regardless of that default.

grant select, insert, update, delete on table
  public.expenses,
  public.market_locations,
  public.market_sales,
  public.market_sale_items
to authenticated;

grant execute on function public.finance_revenue_by_channel(date, date, text) to authenticated;
grant execute on function public.finance_market_revenue(date, date) to authenticated;
grant execute on function public.finance_collected_amount(date, date) to authenticated;
grant execute on function public.finance_expected_payments(date, date, text) to authenticated;
grant execute on function public.finance_expense_summary(date, date) to authenticated;
grant execute on function public.finance_expense_breakdown(date, date) to authenticated;
grant execute on function public.finance_market_top_products(date, date, int) to authenticated;
grant execute on function public.set_order_eta_batch(uuid[], timestamptz[]) to authenticated;
