-- Adds an order_type segment to customers (imported from the legacy CSV
-- "Order Type" column: Delivery / Retail / Wholesale / Bazaar).
--
-- Idempotent: already applied to the remote project via the Supabase MCP
-- on 2026-06-10; this file documents it for the repo + fresh environments.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'customer_order_type') then
    create type customer_order_type as enum ('delivery', 'retail', 'wholesale', 'bazaar');
  end if;
end
$$;

alter table public.customers
  add column if not exists order_type customer_order_type;

comment on column public.customers.order_type is
  'How the customer typically orders (imported from legacy CSV "Order Type"). Nullable.';
