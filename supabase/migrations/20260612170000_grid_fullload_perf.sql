-- 20260612170000_grid_fullload_perf
--
-- Make the admin "Excel view" grids load the full (bounded) table fast, with
-- index-backed sorting/search, scaling toward the §1 1000-user / tens-of-
-- thousands-of-rows bar. Three independent, low-risk changes:
--
--   1. RLS initplan rewrite — is_admin()/auth.uid() were referenced bare in
--      every policy, so Postgres re-evaluates them PER ROW. On a 2000-row grid
--      load that's 2000 is_admin() subqueries. Wrapping in (select …) makes the
--      planner hoist them to a once-per-query InitPlan. (Supabase advisor 0003;
--      explicitly deferred in 20260612160000_perf_fk_indexes_search_path.sql.)
--   2. Name search fix — the trigram index is on (first_name || ' ' || last_name)
--      but the query does `first_name ILIKE %x% OR last_name ILIKE %x% OR phone
--      ILIKE %x%`, which the planner cannot satisfy from the concatenated index
--      → seq scan today. Replace with per-column trigram indexes.
--   3. Sortable-column indexes — every grid column header must sort index-backed,
--      each paired with id as a stable keyset tie-breaker (for the >cap keyset
--      escape hatch).

-- ── 1. RLS initplan: wrap admin + owner predicates in (select …) ────────────
-- (select is_admin()) / (select auth.uid()) are row-independent scalar
-- subqueries → evaluated once per query, not once per row.

alter policy app_users_admin_all on app_users
  using ((select is_admin())) with check ((select is_admin()));
alter policy app_users_self_select on app_users
  using (id = (select auth.uid()));
alter policy products_admin_all on products
  using ((select is_admin())) with check ((select is_admin()));
alter policy customers_admin_all on customers
  using ((select is_admin())) with check ((select is_admin()));
alter policy addresses_admin_all on addresses
  using ((select is_admin())) with check ((select is_admin()));
alter policy orders_admin_all on orders
  using ((select is_admin())) with check ((select is_admin()));
alter policy order_items_admin_all on order_items
  using ((select is_admin())) with check ((select is_admin()));
alter policy order_status_events_admin_all on order_status_events
  using ((select is_admin())) with check ((select is_admin()));
alter policy recurring_templates_admin_all on recurring_templates
  using ((select is_admin())) with check ((select is_admin()));
alter policy geocoding_cache_admin_all on geocoding_cache
  using ((select is_admin())) with check ((select is_admin()));
alter policy geocoding_api_calls_admin_all on geocoding_api_calls
  using ((select is_admin())) with check ((select is_admin()));
alter policy audit_log_admin_all on audit_log
  using ((select is_admin())) with check ((select is_admin()));
alter policy order_payments_admin_all on order_payments
  using ((select is_admin())) with check ((select is_admin()));
alter policy product_price_tiers_admin_all on product_price_tiers
  using ((select is_admin())) with check ((select is_admin()));
alter policy customer_product_prices_admin_all on customer_product_prices
  using ((select is_admin())) with check ((select is_admin()));

alter policy customer_views_select_own on customer_views
  using (owner_id = (select auth.uid()));
alter policy customer_views_insert_own on customer_views
  with check (owner_id = (select auth.uid()));
alter policy customer_views_update_own on customer_views
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
alter policy customer_views_delete_own on customer_views
  using (owner_id = (select auth.uid()));

-- ── 2. Name search: per-column trigram indexes ──────────────────────────────
-- The concatenated index can't serve per-column ILIKE; replace it.
create index if not exists customers_first_name_trgm_idx
  on customers using gin (first_name gin_trgm_ops);
create index if not exists customers_last_name_trgm_idx
  on customers using gin (last_name gin_trgm_ops);
create index if not exists customers_phone_trgm_idx
  on customers using gin (phone gin_trgm_ops);
drop index if exists customers_name_trgm_idx;

-- ── 3. Sortable-column indexes (+ id tie-breaker for keyset) ─────────────────
-- Customers — sortable headers: first_name, last_name, phone, order_type,
-- created_at (status/account_type already covered by earlier migrations).
create index if not exists customers_first_name_id_idx on customers (first_name, id);
create index if not exists customers_last_name_id_idx  on customers (last_name, id);
create index if not exists customers_phone_id_idx      on customers (phone, id);
create index if not exists customers_order_type_id_idx on customers (order_type, id)
  where order_type is not null;
create index if not exists customers_created_at_id_desc_idx
  on customers (created_at desc, id desc);

-- Orders — sortable headers: order_number, payment_status, total_minor,
-- scheduled_for (all statuses), created_at. (status already indexed.)
create index if not exists orders_scheduled_for_id_desc_idx
  on orders (scheduled_for desc, id desc);
create index if not exists orders_order_number_idx on orders (order_number);
create index if not exists orders_payment_status_created_idx
  on orders (payment_status, created_at desc);
create index if not exists orders_total_minor_created_idx
  on orders (total_minor, created_at desc);
create index if not exists orders_created_at_id_desc_idx
  on orders (created_at desc, id desc);
