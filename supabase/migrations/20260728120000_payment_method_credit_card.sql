-- 20260728120000_payment_method_credit_card
-- Storefront card payments via PayTR. Add 'credit_card' to the payment_method
-- enum. IF NOT EXISTS makes it idempotent; ADD VALUE only appends (safe on PG15).
-- The value isn't used elsewhere in this migration, so it runs cleanly.

alter type payment_method add value if not exists 'credit_card';
