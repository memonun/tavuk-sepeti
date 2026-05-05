-- 003_create_products + seed
-- SPEC.md §3.2 — fixed catalog seeded once; admin updates prices over time.
--
-- key: stable string identifier referenced by FK from order_items. Never
-- changes once shipped (treat as part of the wire contract).
--
-- min_qty / step are numeric(10,2) so cheese/yogurt at 0.5 kg increments
-- represent exactly. Domain layer enforces `quantity % step === 0`; we
-- don't add a CHECK here because step varies by product (would need a
-- trigger that joins to products on every insert).

create table products (
  key text primary key,
  display_name text not null,
  unit text not null check (unit in ('package', 'liter', 'kilogram', 'piece')),
  unit_label text not null,
  package_size numeric(10, 2) not null check (package_size > 0),
  min_qty numeric(10, 2) not null check (min_qty > 0),
  step numeric(10, 2) not null check (step > 0),
  -- kuruş — minor units only (CLAUDE.md §7). Admin updates this; OrderItem
  -- snapshots it at order time so historical totals stay correct.
  current_unit_price_minor bigint not null default 0 check (current_unit_price_minor >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table products is
  'Fixed Faz 1 catalog. Admin edits price; key is a permanent contract.';

-- updated_at touch trigger.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

-- ---- Seed ------------------------------------------------------------------
-- ON CONFLICT DO NOTHING so re-running the seed (or running on an existing
-- DB) is safe. Prices start at 0 — admin sets them in the UI.

insert into products (key, display_name, unit, unit_label, package_size, min_qty, step)
values
  ('eggs',   'Yumurta', 'package',  'paket (15 adet)', 15,  1,   1),
  ('milk',   'Süt',     'liter',    'litre',           1,   1,   1),
  ('cheese', 'Peynir',  'kilogram', 'kg',              0.5, 0.5, 0.5),
  ('yogurt', 'Yoğurt',  'kilogram', 'kg',              0.5, 0.5, 0.5)
on conflict (key) do nothing;
