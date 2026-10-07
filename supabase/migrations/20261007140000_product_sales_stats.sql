-- Add RPC to list products with sales statistics
-- Used by both the storefront (active only) and admin catalog manager (all)

create or replace function list_products_with_sales(p_active_only boolean default false)
returns table(
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
  sort_order numeric,
  total_quantity_sold numeric
)
language sql
stable
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
    coalesce(sum(oi.quantity), 0) as total_quantity_sold
  from products p
  left join order_items oi on oi.product_key = p.key
  where (not p_active_only or p.active)
  group by p.key, p.id;
$$;

comment on function list_products_with_sales is
  'Returns products with their total quantity sold. p_active_only=true filters to active only (storefront), false returns all (admin).';
