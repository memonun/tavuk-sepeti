-- 20260823120000_schema_wide_authenticated_grants
--
-- 20260820100000_finance_and_routing_grants fixed this bug class (missing
-- base-table/function GRANTs under the migration-runner role's restrictive
-- default ACL — see that migration's header for the full root-cause writeup)
-- but scoped it to the finance + routing objects that surfaced the symptom
-- first. A fresh `npx supabase db reset` still fails with `permission denied
-- for table X` (42501) on every table created before that fix, because none
-- of them ever received an explicit grant either — they worked only because
-- of the same environment-dependent default ACL behavior the previous
-- migration's header describes as unreliable. Verified empirically against a
-- clean local reset via `has_table_privilege('authenticated', ...)` /
-- `has_function_privilege(...)`, not by re-reading each CREATE TABLE by eye,
-- since several tables/functions were redefined across many migrations and
-- only the final signature/state matters for what's actually missing today.
--
-- Scope of this migration is strictly the GRANT layer — RLS policies already
-- gate row access correctly on every one of these tables (each has an
-- `<table>_admin_all` policy for `authenticated`, most also carry a narrower
-- self-service or public-read policy). GRANT is necessary-but-not-sufficient
-- here, not a bypass: RLS still applies after the grant.
--
-- One table is deliberately excluded: `guest_order_lookup_attempts`
-- (20260819160000) has RLS enabled with NO policies at all, by design — it's
-- only ever written/read from inside a SECURITY DEFINER function, never
-- through PostgREST. Granting `authenticated` there would contradict that
-- table's own comment and add a surface that was intentionally never meant
-- to exist.
--
-- Functions: audited every non-extension function in `public` the same way.
-- All of them already have EXECUTE resolvable by `authenticated` — either an
-- explicit grant from their own migration, or (for plain SECURITY INVOKER
-- functions with no explicit grant, e.g. `count_orders_by_customers`)
-- Postgres's normal CREATE FUNCTION default of EXECUTE-to-PUBLIC, which this
-- database does apply for plain functions. The only functions without
-- `authenticated` EXECUTE are the customer/guest RPCs (`place_web_order`,
-- `place_guest_order`, `lookup_guest_order`, `lookup_guest_order_by_number`,
-- `lookup_guest_orders_by_details`, `link_customer_account`,
-- `update_customer_profile`, `upsert_customer_address`,
-- `delete_customer_address`, `create_customer_recurring_template`,
-- `cancel_customer_recurring_template`) — every one of these is SECURITY
-- DEFINER and deliberately locked to `service_role` only (see e.g.
-- 20260728160000, 20260819150000 headers); the app only ever calls them via
-- the service-role admin client (`shared/supabase/admin.ts`), never as
-- `authenticated`. Left untouched — adding `authenticated` there would widen
-- access beyond what was designed.
--
-- Two tables also get anon SELECT here, not just authenticated DML:
-- `products` and `product_price_tiers` already have `anon`-targeted read
-- policies from 20260726120000 (the public `/magaza` catalog), and
-- `service_areas` / `storefront_settings` have anon-read policies from their
-- own migrations (20260805090200, 20260813120000) — none of those four ever
-- got a matching base grant, so the public storefront's read path is broken
-- on a clean reset today exactly like the admin path is. Kept to SELECT
-- only, matching the narrow anon surface those migrations describe (no anon
-- INSERT/UPDATE/DELETE anywhere — order placement stays exclusively behind
-- the privileged RPCs above).

grant select, insert, update, delete on table
  public.addresses,
  public.app_users,
  public.audit_log,
  public.customer_product_prices,
  public.customer_views,
  public.customers,
  public.geocoding_api_calls,
  public.geocoding_cache,
  public.notifications,
  public.order_items,
  public.order_payments,
  public.order_status_events,
  public.orders,
  public.product_price_tiers,
  public.products,
  public.recurring_templates,
  public.saved_locations,
  public.service_areas,
  public.storefront_settings
to authenticated;

grant select on table
  public.product_price_tiers,
  public.products,
  public.service_areas,
  public.storefront_settings
to anon;
