-- 025_customer_views
--
-- Saved views for the customers DataGrid (Sprint 4 / Notion-style table).
--
-- Each row is one named view that captures a snapshot of the grid state
-- (filters, sort, grouping, column visibility/order/pinning, aggregates).
-- Owners can save several views per table — "Aktif İstanbul müşterileri",
-- "Bu hafta eklenen", "Pasif > 3 ay" — and switch between them via the
-- tab bar above the grid.
--
-- Scope deliberately small: a view belongs to one admin (no shared
-- views, no roles), and config is stored as opaque JSONB so adding a
-- new pref (e.g., aggregate sub-types) doesn't need a migration.
--
-- table_id ties the view to a grid (currently "customers"; future
-- grids — orders, routes — will reuse the same table with their own
-- table_id). This keeps "list my views" a single index hit per page.

create table customer_views (
  id uuid primary key default gen_random_uuid(),
  -- The DataGrid `tableId` prop. Lower-snake-case ASCII; constrained so
  -- a typo there ("custmoers") doesn't quietly fragment the view list.
  table_id text not null check (table_id ~ '^[a-z][a-z0-9_]*$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- Human-readable label, shown on the tab. Trimmed at the schema layer
  -- but the DB cap is a hard backstop.
  name text not null check (length(trim(name)) between 1 and 80),
  -- Grid config snapshot. Opaque to the DB — Zod parses it at the
  -- application boundary. Defaults to {} so an "empty view" is the
  -- baseline grid.
  config jsonb not null default '{}'::jsonb,
  -- When true, this is the default view shown when the user lands on
  -- the page without picking one. Enforced unique per (owner, table)
  -- via a partial index below — toggle one default, the previous one
  -- gets cleared by the Server Action.
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Most-common query: "list this admin's views for this grid", ordered
-- by name (the tab bar shows alphabetical for stability across renames).
create index customer_views_owner_table_idx
  on customer_views (owner_id, table_id, name);

-- At most one default per (owner, table). Partial index → only
-- enforced when is_default=true, so unsetting the flag doesn't need
-- a delete.
create unique index customer_views_one_default_per_table
  on customer_views (owner_id, table_id)
  where is_default = true;

-- Trigger to keep updated_at honest. Reuses the set_updated_at()
-- function defined in 003_create_products.sql.
create trigger customer_views_set_updated_at
  before update on customer_views
  for each row execute function set_updated_at();

-- ---- RLS ------------------------------------------------------------
-- Per CLAUDE.md §7: RLS on every table. Views are private to their
-- owner — no shared/team views in Faz 1. Anyone authenticated can
-- create views for themselves; only the owner can read / update /
-- delete their rows.

alter table customer_views enable row level security;

create policy customer_views_select_own
  on customer_views for select
  using (owner_id = auth.uid());

create policy customer_views_insert_own
  on customer_views for insert
  with check (owner_id = auth.uid());

create policy customer_views_update_own
  on customer_views for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy customer_views_delete_own
  on customer_views for delete
  using (owner_id = auth.uid());

comment on table customer_views is
  'Per-admin saved DataGrid views (filters/sort/grouping/column state). '
  'Scoped to one grid via table_id. RLS: owner-only.';
