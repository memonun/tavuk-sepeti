-- 024_customers_list_perf
--
-- Indexes + RPC that keep /customers fast as we grow from 283 → ~10k rows.
-- Backed by the performance-engineer audit (2026-05-12) — the three
-- top-priority wins:
--   1. Composite index for the most-common access path: status + created_at desc
--   2. Partial indexes for the new segmentation filters (tag, legacy_segment)
--   3. RPC that returns all filter dropdown options in one round-trip

-- ---- Customers ------------------------------------------------------------

-- Default landing page does `order by created_at desc limit 25` with the
-- most-common filter being `status = 'active'`. Composite descending index
-- → switches the plan from `Seq Scan + Sort` to `Index Scan`. Supersedes
-- the existing partial `customers_status_active_idx` which only covered
-- the equality and forced a sort.
drop index if exists customers_status_active_idx;

create index customers_status_created_at_desc_idx
  on customers (status, created_at desc);

-- Unfiltered list (default landing page when no status filter is set).
-- Without this, the `order by created_at desc limit 25` falls back to a
-- full scan + top-N sort at ~1k rows.
create index customers_created_at_desc_idx
  on customers (created_at desc);

-- Segmentation filters (added in migration 023). All three columns are
-- low-cardinality (~10–20 distinct values each) so partial indexes keep
-- the bytes-per-index small while still pruning the table for the
-- equality filter.
create index customers_tag_idx
  on customers (tag)
  where tag is not null;

create index customers_legacy_segment_idx
  on customers (legacy_segment)
  where legacy_segment is not null;

-- account_type has a default of 'individual' for most rows; the partial
-- excludes that bucket so the index serves the "show me only businesses /
-- charities / bazaar vendors" filter cheaply.
create index customers_account_type_idx
  on customers (account_type)
  where account_type <> 'individual';

-- ---- Addresses -----------------------------------------------------------

-- The customer list filters by `addresses.city = ? AND addresses.is_primary`
-- and `addresses.accuracy in (...) AND addresses.is_primary`. Partial on
-- is_primary keeps the index tiny — exactly one row per customer in Faz 1.
create index addresses_city_primary_idx
  on addresses (city)
  where is_primary;

create index addresses_accuracy_primary_idx
  on addresses (accuracy)
  where is_primary;

-- ---- Filter dropdowns RPC ------------------------------------------------
--
-- Replaces three full-table SELECTs in `get-filter-options.ts` (every row's
-- city, tag, legacy_segment) with a single round-trip that returns
-- pre-deduplicated, pre-sorted arrays. At 283 rows the savings are modest;
-- at 10k rows we avoid transferring ~30k rows of payload to dedupe ~50
-- strings.
--
-- STABLE: same inputs → same output within a transaction.
-- SECURITY INVOKER: RLS still gates access (admin reads only).

create or replace function customer_filter_options()
returns table (cities text[], tags text[], legacy_segments text[])
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select coalesce(array_agg(distinct city order by city), '{}'::text[])
       from addresses
       where is_primary and city is not null),
    (select coalesce(array_agg(distinct tag order by tag), '{}'::text[])
       from customers
       where tag is not null),
    (select coalesce(array_agg(distinct legacy_segment order by legacy_segment), '{}'::text[])
       from customers
       where legacy_segment is not null);
$$;

revoke all on function customer_filter_options() from public;
grant execute on function customer_filter_options() to authenticated;
