-- 20260927120000_market_sale_item_prices
--
-- Pazar Satışları (20260819210100) only ever recorded a lump total_amount_minor
-- for the whole stall day; market_sale_items existed just to say WHICH products
-- sold, with no price. The owner wants each recorded product to carry its own
-- price too, so it can be reported on ("kaça sattık"), not just tallied.
--
-- unit_price_minor / line_total_minor are plain, APP-COMPUTED columns — same
-- convention as order_items (20260611140100_order_items_authoritative_line_total:
-- the app rounds once with priceOrderLine-equivalent math and stores the exact
-- result, never a generated expression that could re-derive a different rounding
-- from a possibly-fractional tier rate). Both default to 0 so the existing
-- INSERT (quantity-only) from before this migration keeps working unmodified
-- during the deploy window, and every row recorded before today simply reads as
-- "no price captured" (0), which the app/report treat as a known limitation, not
-- an error — there is no historical price to back-fill from.
--
-- total_amount_minor stays the sale's own authoritative figure (still typed by
-- the admin, still not required to equal the sum of item lines) — the point of
-- this migration is per-product detail, not forcing every stall day to be fully
-- itemized.

alter table market_sale_items
  add column unit_price_minor bigint not null default 0
    check (unit_price_minor >= 0),
  add column line_total_minor bigint not null default 0
    check (line_total_minor >= 0);

comment on column market_sale_items.unit_price_minor is
  'Price (kuruş) the item actually sold at that stall day — app-entered, independent of products.current_unit_price_minor (which can differ/change later). 0 on rows recorded before 2026-09-27 (price was not captured yet).';
comment on column market_sale_items.line_total_minor is
  'quantity × unit_price_minor, rounded once by the app (CLAUDE.md §7) — authoritative, not reconciled against market_sales.total_amount_minor.';

-- ---- finance_market_top_products: also report revenue, not just quantity ----
--
-- Return-shape change (adds a column), not a new required parameter — the
-- CLAUDE.md §7 "old code still calling the old signature" incident was about a
-- newly REQUIRED input old callers didn't send; here old app code just gets one
-- extra field back in the JSON it already ignores selectively, so it keeps
-- working unmodified. The app-side mapper additionally coalesces the new field
-- to 0 (features/finance/infrastructure/finance-reporting.repository.ts) so the
-- reverse gap — new app code hitting the OLD function during the few minutes
-- before this migration lands — degrades to "revenue not shown yet" instead of
-- throwing. `drop` is required because Postgres refuses `create or replace` on
-- a changed return type.
drop function if exists finance_market_top_products(date, date, int);

create function finance_market_top_products(
  p_from date,
  p_to date,
  p_limit int default 10
)
returns table (
  product_key text,
  product_name text,
  total_quantity numeric,
  total_revenue_minor bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.key,
    p.display_name,
    sum(msi.quantity) as total_quantity,
    sum(msi.line_total_minor) as total_revenue_minor
  from market_sale_items msi
  join market_sales ms on ms.id = msi.sale_id
  join products p on p.key = msi.product_key
  where ms.sale_date between p_from and p_to
  group by p.key, p.display_name
  order by total_revenue_minor desc, total_quantity desc
  limit p_limit;
$$;

comment on function finance_market_top_products is
  'Products sold at market stalls in a date range, revenue-ranked, with quantity and revenue (sum of market_sale_items.line_total_minor — 0 for rows predating 2026-09-27''s per-item pricing). Feeds Pazar Satışları''s Satılan Ürünler panel.';

-- Plain SECURITY INVOKER functions on this database default to EXECUTE-to-
-- PUBLIC (verified in 20260823120000's audit), so this is redundant but kept
-- for the same belt-and-suspenders reason that migration adopted going
-- forward — see memory "new-tables-need-explicit-grants".
grant execute on function finance_market_top_products(date, date, int) to authenticated;
