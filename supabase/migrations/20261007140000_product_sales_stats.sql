-- 20261007140000_product_sales_stats
--
-- WHY: the admin catalog manager shows how much of each product has been sold.
-- One RPC returns the catalog with that total attached, so the page makes a
-- single round trip and the sum is aggregated in Postgres, not in the app.
--
-- "Sold" follows the same rule as product_tally() / finance_revenue_by_channel:
-- every order status except cancelled.
--
-- The sales total is pre-aggregated per product in a subquery and LEFT JOINed
-- to products (primary key: `key`), so the outer query needs no GROUP BY and a
-- product with no sales still comes back with 0. order_items.product_key is
-- indexed via the FK lookups used elsewhere; the aggregate is one pass over
-- order_items.
--
-- Return column types must match products exactly — a LANGUAGE sql function is
-- type-checked against its RETURNS TABLE at creation (sort_order is integer).

create or replace function list_products_with_sales(p_active_only boolean default false)
returns table (
  key text,
  display_name text,
  unit text,
  unit_label text,
  package_size numeric,
  min_qty numeric,
  step numeric,
  current_unit_price_minor bigint,
  active boolean,
  fulfillment_type text,
  is_web_visible boolean,
  is_featured boolean,
  web_description text,
  image_path text,
  image_alt text,
  sort_order integer,
  total_quantity_sold numeric
)
language sql
security invoker
stable
set search_path = public
as $$
  select
    p.key,
    p.display_name,
    p.unit,
    p.unit_label,
    p.package_size,
    p.min_qty,
    p.step,
    p.current_unit_price_minor,
    p.active,
    p.fulfillment_type,
    p.is_web_visible,
    p.is_featured,
    p.web_description,
    p.image_path,
    p.image_alt,
    p.sort_order,
    coalesce(s.quantity_sold, 0) as total_quantity_sold
  from products p
  left join (
    select oi.product_key, sum(oi.quantity) as quantity_sold
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.status <> 'cancelled'
    group by oi.product_key
  ) s on s.product_key = p.key
  where (not p_active_only or p.active)
  order by p.active desc, p.sort_order, p.display_name;
$$;

-- New functions need an explicit grant since mid-2026 (see
-- 20260823120000_schema_wide_authenticated_grants). SECURITY INVOKER, so RLS on
-- products/orders/order_items still decides what each caller can see.
grant execute on function public.list_products_with_sales(boolean) to authenticated;

comment on function list_products_with_sales is
  'Products with total quantity sold (all non-cancelled orders). p_active_only=true returns active products only, false returns the whole catalog (admin).';
