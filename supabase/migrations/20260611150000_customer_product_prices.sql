-- 20260611150000_customer_product_prices
--
-- Per-customer special pricing. Some customers pay a different, flat price for
-- a product (e.g. a reseller pays ₺110/pkg eggs) regardless of the normal
-- volume tiers. One flat unit price per (customer, product); when present it
-- overrides the product's tiers/base for that customer's order lines.
--
-- Flat kuruş (whole units) — admins type whole-lira prices; the pricing engine
-- rounds the line total. Set/edited inline on the order editor; persists.

create table customer_product_prices (
  customer_id      uuid   not null references customers(id) on delete cascade,
  product_key      text   not null references products(key) on delete cascade,
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (customer_id, product_key)
);

-- RLS: admin-only, mirroring every other table.
alter table customer_product_prices enable row level security;
create policy customer_product_prices_admin_all on customer_product_prices
  for all to authenticated using (is_admin()) with check (is_admin());

-- Lookup by customer (the order flow loads all of a customer's specials).
create index customer_product_prices_customer_idx
  on customer_product_prices (customer_id);
