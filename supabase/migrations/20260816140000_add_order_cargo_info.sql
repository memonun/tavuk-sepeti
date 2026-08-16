-- 20260816140000_add_order_cargo_info
--
-- Manual cargo tracking fields for shipping-channel orders. All three are
-- optional and independent of order_status — an admin can fill them in
-- before, at, or after marking an order "shipped" (see order-state-machine.ts,
-- confirmed -> shipped is itself optional). Kept as separate carrier/number/
-- url columns rather than one free-text field so a future "auto-build the
-- tracking URL from carrier + number" step (not built yet) has something to
-- key off without another migration.

alter table orders
  add column cargo_carrier text check (cargo_carrier is null or length(cargo_carrier) <= 200),
  add column cargo_tracking_number text check (cargo_tracking_number is null or length(cargo_tracking_number) <= 200),
  add column cargo_tracking_url text check (cargo_tracking_url is null or length(cargo_tracking_url) <= 2000);

comment on column orders.cargo_carrier is
  'Cargo company name (e.g. "PTT Kargo"), entered manually by an admin. Null until set.';
comment on column orders.cargo_tracking_number is
  'Carrier tracking/waybill number, entered manually by an admin. Null until set.';
comment on column orders.cargo_tracking_url is
  'Carrier tracking page URL, entered manually by an admin. Null until set.';
