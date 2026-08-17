-- Admin-controlled display order for products (homepage + admin catalog list).
-- Existing rows default to 0 so ordering falls back to display_name (unchanged
-- behavior) until an admin sets an explicit sort_order.

alter table products
  add column if not exists sort_order integer not null default 0;
