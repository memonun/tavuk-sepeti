-- 20260814120000_customer_guest_origin
--
-- WHY: the owner asked for ordering WITHOUT an account. A guest still needs a
-- `customers` row (orders.customer_id is NOT NULL), but it must not live in the
-- same space as web accounts, because `customers_phone_unique_web` would reject
-- the second order from the same phone number.
--
-- Owner rule, unchanged from 20260805090000: web-originated records are written
-- FROM SCRATCH and never matched onto anything. Applied to guests that means one
-- fresh row per order, so the guest space deliberately gets NO phone/email
-- unique index — duplicates are the accepted cost of never mis-attaching an
-- order to somebody else's record, which is exactly what the old
-- `on conflict (phone)` writer did.
--
-- Alone in its own migration on purpose: Postgres will not let a new enum value
-- be USED in the same transaction that adds it, so an index predicate or an
-- insert referencing 'customer_guest' here would fail. The writer that uses it
-- lives in the next migration.

alter type customer_origin add value 'customer_guest';
