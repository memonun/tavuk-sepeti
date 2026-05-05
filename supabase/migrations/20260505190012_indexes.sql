-- 012_indexes
-- SPEC.md §4.3 — indexes designed for the queries we KNOW we'll run.
-- Each one has a comment explaining the query it serves; index without a
-- known query is dead weight.

-- ---- Customers ------------------------------------------------------------
-- "List active customers" filter. Partial = only active rows hit the index,
-- which is the usual list view.
create index customers_status_active_idx
  on customers (status)
  where status = 'active';

-- "Search customer by name" — admin types in a search box. Trigram on the
-- concatenated full name supports 'ali k' matching 'Ali Kayalı'.
create index customers_name_trgm_idx
  on customers using gin ((first_name || ' ' || last_name) gin_trgm_ops);

-- ---- Addresses ------------------------------------------------------------
-- "Show all customers within map bounds" / "find nearest N to point".
-- Without GIST these queries are full-table scans.
create index addresses_coordinate_gist
  on addresses using gist (coordinate);

create index addresses_customer_id_idx on addresses (customer_id);

-- ---- Orders ---------------------------------------------------------------
-- "Today's deliveries" — the daily route page hits this every load. Partial
-- index keeps it small (delivered/cancelled don't need to be there).
create index orders_scheduled_for_status_idx
  on orders (scheduled_for, status)
  where status in ('pending', 'confirmed');

-- "Customer order history" — newest first.
create index orders_customer_id_created_at_idx
  on orders (customer_id, created_at desc);

-- "Filter by status" — generic dashboard filter.
create index orders_status_idx on orders (status);

-- ---- Order items ----------------------------------------------------------
-- "Get items for an order" — per-order reads.
create index order_items_order_id_idx on order_items (order_id);

-- "Sales by product" — Faz 2 reporting; cheap to build now.
create index order_items_product_key_idx on order_items (product_key);

-- ---- Status events --------------------------------------------------------
-- "Order timeline" — events for a given order, oldest first.
create index order_status_events_order_id_created_at_idx
  on order_status_events (order_id, created_at);
