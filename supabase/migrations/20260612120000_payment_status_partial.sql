-- 20260612120000_payment_status_partial
--
-- Add 'partial' to payment_status for the ledger-derived state machine
-- (pending → partial → paid). Must be its own migration: a new enum value
-- can't be used in the same transaction it's added, and the next migration's
-- recompute function references it.
--
-- 'failed' / 'refunded' stay in the enum for back-compat but are no longer
-- auto-set (status is derived from recorded payments).

alter type payment_status add value if not exists 'partial';
