-- 20260611140000_product_price_tiers
--
-- Volume/tier pricing. A product's price-per-unit can drop as quantity grows
-- (eggs: 1–2 pkg ₺125, 3 pkg ₺350 total ≈₺116.6667/pkg, 4+ pkg ₺112.50). A
-- tier applies for quantity in [min_qty, next tier's min_qty). Products with
-- no rows are flat-priced from products.current_unit_price_minor.
--
-- unit_price_minor is numeric(12,4) — kuruş with fractional precision (decimal,
-- not float; CLAUDE.md §7) — so the qty=3 egg rate (11666.6667) produces an
-- exact ₺350.00 line total once rounded by the app's pricing engine.

create table product_price_tiers (
  product_key      text          not null references products(key) on delete cascade,
  min_qty          numeric(10, 2) not null check (min_qty > 0),
  unit_price_minor numeric(12, 4) not null check (unit_price_minor >= 0),
  created_at       timestamptz   not null default now(),
  updated_at       timestamptz   not null default now(),
  primary key (product_key, min_qty)
);

-- RLS: admin-only, mirroring every other table (Faz 1, is_admin() helper).
alter table product_price_tiers enable row level security;
create policy product_price_tiers_admin_all on product_price_tiers
  for all to authenticated using (is_admin()) with check (is_admin());

-- Seed the known egg tiers + base prices. Idempotent (re-runnable).
insert into product_price_tiers (product_key, min_qty, unit_price_minor) values
  ('eggs', 1, 12500),
  ('eggs', 3, 11666.6667),
  ('eggs', 4, 11250)
on conflict (product_key, min_qty)
  do update set unit_price_minor = excluded.unit_price_minor, updated_at = now();

-- Base/flat prices: eggs' base = the 1–2 pkg rate; milk ₺40/L. Cheese & yogurt
-- stay 0 until set in the Products admin UI.
update products set current_unit_price_minor = 12500 where key = 'eggs';
update products set current_unit_price_minor = 4000  where key = 'milk';
