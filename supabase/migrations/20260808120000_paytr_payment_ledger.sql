-- 20260808120000_paytr_payment_ledger
--
-- WHY: the PayTR callback wrote `orders.payment_status = 'paid'` + paid_at
-- DIRECTLY. But those columns — plus amount_paid_minor — are derived from the
-- order_payments ledger by recompute_order_payment() (see
-- 20260612120100_order_payments), and two triggers call it:
--
--   order_payments_recompute  — any ledger row insert/update/delete
--   orders_total_recompute    — subtotal_minor / delivery_fee_minor change
--
-- So a card-paid order carried amount_paid_minor = 0 (the admin grid showed it
-- unpaid, balance = the full total, while its status said 'paid'), and the
-- first line-item edit recomputed from an EMPTY ledger: v_paid = 0 flipped a
-- genuinely paid order back to 'pending' and cleared paid_at. Money in, order
-- unpaid, no trace. Exactly the desync the ledger was built to make impossible.
--
-- Fix: the callback inserts a real ledger row (channel = 'card') and lets the
-- trigger derive the status, like every other payment in the system. That needs
-- an idempotency key, because PayTR retries the notification until it receives
-- "OK" and the old `payment_status = 'paid'` short-circuit disappears together
-- with the direct write.

alter table order_payments
  add column if not exists provider     text,
  add column if not exists provider_ref text;

comment on column order_payments.provider is
  'Payment provider that produced this row (e.g. "paytr"). NULL for payments recorded by hand in the admin panel.';
comment on column order_payments.provider_ref is
  'The provider''s own identifier for this payment (PayTR merchant_oid). The idempotency key for retried webhooks, and the handle for reconciling against the provider''s panel.';

-- Idempotency: at most one ledger row per (provider, provider_ref). Partial so
-- the hand-entered rows — both columns NULL, and there are many — are untouched
-- by the constraint. A retried PayTR notification now hits this index instead
-- of double-crediting the order.
create unique index if not exists order_payments_provider_ref_unique
  on order_payments (provider, provider_ref)
  where provider is not null and provider_ref is not null;

-- ---- repair the orders the old callback already "paid" ----------------------
-- Any card order the direct-write path marked paid is sitting on the exact bomb
-- described above: payment_status = 'paid', amount_paid_minor = 0, no ledger
-- row — so the next recompute would mark a genuinely paid order unpaid. Give
-- each one the ledger row it should have had; recompute then re-derives the
-- same 'paid' status from real data.
--
-- The original merchant_oid was never persisted, so provider_ref carries a
-- synthetic marker instead: it keeps the unique index meaningful and makes the
-- row's origin obvious to whoever reconciles against PayTR's panel later.
-- Idempotent via NOT EXISTS — safe to re-run.
insert into order_payments (order_id, amount_minor, channel, paid_at, provider, provider_ref)
select
  o.id,
  o.total_minor,
  'card'::payment_channel,
  coalesce(o.paid_at, now()),
  'paytr',
  'backfill:' || o.id::text
from orders o
where o.payment_method = 'credit_card'
  and o.payment_status = 'paid'
  and o.total_minor > 0
  and not exists (select 1 from order_payments p where p.order_id = o.id);

-- The insert above fires order_payments_recompute per row, so amount_paid_minor
-- and payment_status are already consistent for the repaired orders.
