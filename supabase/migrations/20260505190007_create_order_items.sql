-- 007_create_order_items
-- SPEC.md §3.5 OrderItem
--
-- product_snapshot is jsonb so a future price/name change on the product
-- never re-writes history. unit_price_minor is the frozen price at order
-- time; line_total_minor is computed.
--
-- Domain layer enforces `quantity % step === 0` per product (cheese/yogurt
-- only sell in 0.5 kg increments). We deliberately do NOT mirror that as a
-- DB constraint because it would require joining to products on every
-- insert; defense-in-depth via a future trigger if abuse is observed.

create table order_items (
  id uuid primary key default uuid_generate_v4(),

  order_id uuid not null references orders(id) on delete cascade,
  product_key text not null references products(key) on delete restrict,

  quantity numeric(10, 2) not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  -- Computed and persisted — no chance of drift between display and total.
  line_total_minor bigint
    generated always as ((quantity * unit_price_minor)::bigint) stored,

  -- Frozen product display info (display_name, unit, unit_label) at order
  -- time. Carries enough to render the line without rejoining products.
  product_snapshot jsonb not null,

  created_at timestamptz not null default now()
);

comment on column order_items.product_snapshot is
  'Frozen {display_name, unit, unit_label} at order time. Independent of any later product edit.';
