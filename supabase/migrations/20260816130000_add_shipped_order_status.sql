-- 20260816130000_add_shipped_order_status
-- Cargo orders need an optional "kargolandı" step between confirmed and
-- delivered so admins can record that a shipment left the building before
-- the carrier actually hands it over. IF NOT EXISTS makes it idempotent;
-- ADD VALUE only appends (safe on PG15). The value isn't used elsewhere in
-- this migration, so it runs cleanly (see 20260728120000 for the same
-- pattern on payment_method).

alter type order_status add value if not exists 'shipped' after 'confirmed';
