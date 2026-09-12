-- 20260912120000_order_gift_items
--
-- WHY: staff add small free samples (50-100gr cheese/nuts, a single jar,
-- etc.) into orders by hand at packing time. These never existed anywhere
-- in the system — no order line, no product movement record — so there was
-- no way to answer "how much product actually left the farm this month"
-- versus "how much we sold". This table is the write side (attach a gift
-- to the specific order it rode along with); the read side is the
-- product_tally() RPC below, which the Finans → Ürün Çetelesi report calls.
--
-- Mirrors order_items' FK shape (order_id cascade, product_key restrict)
-- but does NOT snapshot the product's display name/price like order_items
-- does — a gift has no price to freeze, and unlike a paid order line this
-- is an informal tally, not a financial record that must survive a later
-- product rename unchanged. unit_label is deliberately its own column, NOT
-- the product's unit_label: a product normally sold by the kg is often
-- gifted in grams, a fundamentally different unit for the same product.
--
-- unit_label is constrained to a fixed small set (not free text) so
-- product_tally() can safely `sum(quantity) group by unit_label` without
-- silently adding grams to "adet" under one label a typo away from another.

create table order_gift_items (
  id uuid primary key default uuid_generate_v4(),

  order_id uuid not null references orders(id) on delete cascade,
  product_key text not null references products(key) on delete restrict,

  quantity numeric(10, 2) not null check (quantity > 0),
  unit_label text not null check (unit_label in ('gr', 'kg', 'adet', 'ml')),

  note text,

  created_at timestamptz not null default now(),
  created_by uuid references app_users(id) on delete set null
);

create index order_gift_items_order_idx on order_gift_items (order_id);
create index order_gift_items_product_idx on order_gift_items (product_key);

alter table order_gift_items enable row level security;

-- Admin-only, matching every other operational table (CLAUDE.md §7).
create policy order_gift_items_admin_all on order_gift_items
  for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));

-- New tables need an explicit grant since mid-2026 — the old
-- default-privilege behavior for `authenticated` stopped applying (see
-- 20260823120000_schema_wide_authenticated_grants for the full writeup).
grant select, insert, update, delete on table public.order_gift_items to authenticated;

comment on table order_gift_items is
  'Free samples/gifts (50-100gr cheese, a jar, etc.) added to an order by hand at packing. Informal tally, not a priced line item — feeds product_tally() for the Finans Ürün Çetelesi report.';

-- ---- Reporting RPC ---------------------------------------------------------
--
-- One combined result (sold rows + gift rows, discriminated by `kind`) so
-- the app makes one round trip instead of two. Mirrors the existing
-- finance_* RPCs' p_date_basis convention (20260819210200): 'scheduled_for'
-- (delivery day) or 'created_at' (order-placed day). Same "what counts as a
-- real sale" rule as finance_revenue_by_channel — every status except
-- cancelled — applied to both sold and gifted rows for consistency (a gift
-- already handed over before a later cancellation still happened).
create function product_tally(
  p_from date,
  p_to date,
  p_date_basis text default 'scheduled_for'
)
returns table (
  product_key text,
  display_name text,
  kind text,
  unit_label text,
  quantity numeric
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    oi.product_key,
    p.display_name,
    'sold'::text as kind,
    p.unit_label,
    sum(oi.quantity) as quantity
  from order_items oi
  join orders o on o.id = oi.order_id
  join products p on p.key = oi.product_key
  where o.status <> 'cancelled'
    and (
      case when p_date_basis = 'created_at' then o.created_at::date else o.scheduled_for end
    ) between p_from and p_to
  group by oi.product_key, p.display_name, p.unit_label

  union all

  select
    ogi.product_key,
    p.display_name,
    'gift'::text as kind,
    ogi.unit_label,
    sum(ogi.quantity) as quantity
  from order_gift_items ogi
  join orders o on o.id = ogi.order_id
  join products p on p.key = ogi.product_key
  where o.status <> 'cancelled'
    and (
      case when p_date_basis = 'created_at' then o.created_at::date else o.scheduled_for end
    ) between p_from and p_to
  group by ogi.product_key, p.display_name, ogi.unit_label

  order by product_key, kind, unit_label;
$$;

comment on function product_tally is
  'Sold + gifted product quantities for a date range, one row per (product, kind, unit_label). Feeds the Finans Ürün Çetelesi report. Plain SECURITY INVOKER — RLS on orders/order_items/order_gift_items/products applies normally, default EXECUTE-to-PUBLIC covers `authenticated`.';
