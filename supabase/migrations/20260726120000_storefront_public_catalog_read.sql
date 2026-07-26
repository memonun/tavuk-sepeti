-- 20260726120000_storefront_public_catalog_read
-- Faz 2 — public storefront (`/magaza`). The customer-facing catalog is read
-- by anonymous visitors (no login), so the `anon` role needs SELECT on the
-- catalog. We grant the NARROWEST surface that makes the shop work:
--   - products: ACTIVE rows only (archived products stay hidden).
--   - product_price_tiers: all rows (needed to price lines correctly).
--
-- Everything else stays admin-only. No anon INSERT/UPDATE/DELETE anywhere —
-- order placement goes exclusively through the privileged place_web_order()
-- RPC (next migration), never through anon table access. Prices are inherently
-- public on a storefront, so exposing active products + tiers is intentional.
--
-- Policies are additive per role: the existing *_admin_all policies keep full
-- access for authenticated admins; these only add read access for `anon`.

-- products: anonymous visitors may read ACTIVE catalog rows only.
create policy products_anon_read_active on products
  for select
  to anon
  using (active);

-- product_price_tiers: anonymous visitors may read all volume tiers so the
-- catalog and checkout can compute the same authoritative line totals the
-- admin path does. No PII here — pricing is public.
create policy product_price_tiers_anon_read on product_price_tiers
  for select
  to anon
  using (true);
