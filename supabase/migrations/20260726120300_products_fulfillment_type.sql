-- 20260726120300_products_fulfillment_type
-- Some catalog products are self-delivered on the daily route (dairy/eggs);
-- others are sent by cargo and must NOT enter the route (dried fruit, molasses).
-- Add a per-product fulfillment flag to distinguish them, and seed the first
-- batch of cargo (shipping) products.
--
--   fulfillment_type = 'delivery'  → self-delivered, included in the route (default)
--   fulfillment_type = 'shipping'  → shipped by cargo, excluded from the route
--
-- The route query (find_orders_for_route) uses this — see the next migration.

alter table products
  add column fulfillment_type text not null default 'delivery'
    check (fulfillment_type in ('delivery', 'shipping'));

comment on column products.fulfillment_type is
  'delivery = self-delivered on the daily route; shipping = sent by cargo (excluded from find_orders_for_route).';

-- Route filter joins order_items → products on fulfillment_type; index the flag.
create index products_fulfillment_type_idx on products (fulfillment_type);

-- ---- Seed the first cargo (shipping) products ------------------------------
-- Prices in kuruş (CLAUDE.md §7): 800/700/600/700 ₺ per kg. Sold by the kg in
-- 0.5 kg steps (matches the cheese/yogurt convention). Priced, so they show on
-- the storefront immediately; fulfillment_type='shipping' keeps them off the route.
insert into products
  (key, display_name, unit, unit_label, package_size, min_qty, step, current_unit_price_minor, fulfillment_type)
values
  ('gun-kurusu-kayisi', 'Gün Kurusu Kayısı', 'kilogram', 'kg', 1, 0.5, 0.5, 80000, 'shipping'),
  ('sari-kuru-kayisi',  'Sarı Kuru Kayısı',  'kilogram', 'kg', 1, 0.5, 0.5, 70000, 'shipping'),
  ('kuru-dut',          'Kuru Dut',          'kilogram', 'kg', 1, 0.5, 0.5, 60000, 'shipping'),
  ('dut-pekmezi',       'Dut Pekmezi',       'kilogram', 'kg', 1, 0.5, 0.5, 70000, 'shipping')
on conflict (key) do nothing;
