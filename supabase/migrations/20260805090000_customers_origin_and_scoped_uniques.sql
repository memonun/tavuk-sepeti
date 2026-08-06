-- 20260805090000_customers_origin_and_scoped_uniques
--
-- WHY: the storefront must stop matching web signups onto legacy (phone-ordered)
-- customer rows. Owner decision 2026-08-05: "hali hazırda olan bilgiler ve
-- müşteriler olduğu gibi kalsın, onları matchlemekle uğraşmayalım — websitesinden
-- gelen hesaplar db'de hiç yokmuş gibi sıfırdan yazılsın."
--
-- Today `customers_phone_unique` is a single partial unique index over the whole
-- table, so a web signup whose phone already belongs to a legacy row cannot be
-- inserted. The current workaround (see link_customer_account / place_web_order)
-- is to silently drop the colliding phone to NULL — which is a LIVE BUG: that
-- account then places a route order and the driver's stop shows "Telefon eksik"
-- for no visible reason.
--
-- Fix: mark every customer row with its origin, and split the phone/email unique
-- indexes along it. One legacy row and one web row may now hold the same phone;
-- neither can be duplicated inside its own space.
--
-- The split is on `origin`, NOT on `auth_user_id`. auth_user_id is
-- `references auth.users(id) on delete set null` — deleting a login would flip a
-- row from the "web" index into the "legacy" index and could raise a unique
-- violation *during the auth deletion*. `origin` never changes.

create type customer_origin as enum ('admin_manual', 'customer_web');

alter table customers
  add column origin customer_origin not null default 'admin_manual';

-- Backfill: admins live in app_users, never in customers — so any customers row
-- carrying an auth_user_id was created by the storefront, by construction.
update customers set origin = 'customer_web' where auth_user_id is not null;

comment on column customers.origin is
  'Which channel created this customer. admin_manual = CRM/panel (legacy phone customers); customer_web = storefront signup. Immutable — the phone/email unique indexes are partitioned by it.';

-- ---- Scoped uniqueness ------------------------------------------------------
-- Splitting a partial unique index only ever RELAXES the constraint, so this
-- cannot fail on existing data: anything the global index accepted is still
-- unique inside whichever half it lands in.

drop index customers_phone_unique;

create unique index customers_phone_unique_admin
  on customers (phone)
  where phone is not null and origin = 'admin_manual';

create unique index customers_phone_unique_web
  on customers (phone)
  where phone is not null and origin = 'customer_web';

drop index customers_email_unique;

create unique index customers_email_unique_admin
  on customers (email)
  where email is not null and origin = 'admin_manual';

create unique index customers_email_unique_web
  on customers (email)
  where email is not null and origin = 'customer_web';

-- No index on `origin` alone: two distinct values over a few thousand rows means
-- the planner's bitmap/seq scan beats an index lookup. The admin grid filters it
-- alongside other predicates, which the existing indexes already serve.
