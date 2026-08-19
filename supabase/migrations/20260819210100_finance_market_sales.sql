-- 20260819210100_finance_market_sales
--
-- Physical market-stall (pazar) sales for the Finans admin section. Apuhan
-- Çiftliği currently runs two weekly stalls in Malatya, but this is a plain
-- data table (not an enum / hardcoded pair) so a third location later is an
-- INSERT, not a migration.
--
-- total_amount_minor is entered directly by the admin at time of sale (a
-- quick tally, not a priced invoice) — market_sale_items exists purely for
-- "which products sold" reporting (En Çok Satılan Ürünler) and its
-- quantities are not required to reconcile against the total.
--
-- Reuses manual_payment_method from 20260819210000_finance_expenses.sql.

create table market_locations (
  id uuid primary key default uuid_generate_v4(),
  name text not null check (length(name) between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index market_locations_name_unique on market_locations (name);

comment on table market_locations is
  'Physical market stalls Apuhan Çiftliği sells at. Not assumed to stay at two — add rows, no migration needed.';

create table market_sales (
  id uuid primary key default uuid_generate_v4(),
  -- restrict: a location with recorded sales can't be deleted, only archived
  -- (active = false) — matches the products archive convention (CLAUDE.md §7).
  location_id uuid not null references market_locations(id) on delete restrict,
  sale_date date not null,
  total_amount_minor bigint not null check (total_amount_minor > 0),
  payment_method manual_payment_method not null default 'cash',
  note text check (note is null or length(note) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index market_sales_date_idx on market_sales (sale_date);
create index market_sales_location_idx on market_sales (location_id);

create table market_sale_items (
  id uuid primary key default uuid_generate_v4(),
  sale_id uuid not null references market_sales(id) on delete cascade,
  -- Same column name/shape as order_items.product_key (text FK to the
  -- catalog's text primary key, not a uuid — 20260505190003). restrict: a
  -- product with recorded market sales can't be hard-deleted, only archived.
  product_key text not null references products(key) on delete restrict,
  quantity numeric not null check (quantity > 0)
);

create index market_sale_items_sale_idx on market_sale_items (sale_id);
create index market_sale_items_product_idx on market_sale_items (product_key);

alter table market_locations enable row level security;
create policy market_locations_admin_all on market_locations
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));

alter table market_sales enable row level security;
create policy market_sales_admin_all on market_sales
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));

alter table market_sale_items enable row level security;
create policy market_sale_items_admin_all on market_sale_items
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));

create trigger market_sales_set_updated_at
  before update on market_sales
  for each row execute function set_updated_at();

-- Seed the two current stalls as data, not code — matches this migration's
-- own "add a location = INSERT" comment above.
insert into market_locations (name) values
  ('Pazar Yeri 1'),
  ('Pazar Yeri 2');
