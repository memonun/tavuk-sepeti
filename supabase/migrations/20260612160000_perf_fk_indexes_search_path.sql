-- 20260612160000_perf_fk_indexes_search_path
--
-- Advisor-driven, zero-risk DB hardening (Supabase performance + security
-- linters):
--   * Covering indexes for foreign keys that lacked one (lint 0001) — speeds
--     joins + cascade deletes on these relationships.
--   * Pin search_path on the util/trigger functions flagged by the security
--     linter (lint 0011) so they can't be hijacked via a mutable search_path.
--
-- (The bigger RLS `initplan` win — wrapping is_admin()/auth.<fn>() in
-- (select …) so they evaluate once per query instead of per row — is a
-- separate, carefully-tested migration since it rewrites every table's policy.)

create index if not exists customer_product_prices_product_key_idx
  on customer_product_prices (product_key);

create index if not exists recurring_templates_customer_id_idx
  on recurring_templates (customer_id);

alter function public.next_order_number() set search_path = public;
alter function public.sync_address_coordinate() set search_path = public;
alter function public.set_updated_at() set search_path = public;
