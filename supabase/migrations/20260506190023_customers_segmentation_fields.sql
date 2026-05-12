-- 023_customers_segmentation_fields
--
-- Three classification fields driven by the CSV import + everyday admin
-- workflow. Naming is deliberate:
--
--   account_type   — Real, constrained, drives logic (B2C/B2B/charity/bazaar
--                    vendor). Pricing tier + invoice format will branch on
--                    this in Faz 2. Constrained text + CHECK so wrong values
--                    fail at the DB.
--
--   tag            — Free-text single tag (Hacıbaba, Navitas, Instagram, …).
--                    A many-to-many tags table is the right Faz 2 shape; this
--                    column is the disposable Faz 1 placeholder.
--
--   legacy_segment — The CSV's "Customer Type" (Regular Subscriber, One Time
--                    Buyer, Didnt Buy Recently, …). Explicitly named "legacy"
--                    because the real Faz 2 answer is to compute behavioral
--                    classification from the orders table, not store it.
--                    Dump-and-drop safe: no indexes, no logic, no foreign keys.
--
-- Also: phone becomes nullable to match real-world data — pazar (open-market)
-- customers walk in without ever giving a number. The existing CHECK pattern
-- now allows NULL; the unique index becomes partial (only enforced when
-- phone is present).

alter table customers
  add column account_type text
    check (account_type in ('individual', 'business', 'charity', 'bazaar_vendor'))
    default 'individual',
  add column tag text
    check (tag is null or length(trim(tag)) <= 100),
  add column legacy_segment text
    check (legacy_segment is null or length(trim(legacy_segment)) <= 100);

-- Phone: drop NOT NULL + relax the CHECK to allow NULL. Then rebuild the
-- unique index as partial (only enforce uniqueness when phone is set).
alter table customers
  alter column phone drop not null;

alter table customers
  drop constraint customers_phone_check;

alter table customers
  add constraint customers_phone_check
  check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$');

drop index if exists customers_phone_unique;
create unique index customers_phone_unique
  on customers (phone)
  where phone is not null;

comment on column customers.account_type is
  'Entity classification: individual (B2C), business (B2B retail/wholesale), charity (vakıf/dernek), bazaar_vendor (pazarcı). Drives pricing tier + invoice format in Faz 2.';
comment on column customers.tag is
  'Free-text single tag for affiliation cluster (Hacıbaba, Navitas, Universite, …). Disposable; will be replaced by a tags table in Faz 2.';
comment on column customers.legacy_segment is
  'CSV-imported segmentation label. Display + filter only — do not branch business logic on this column; compute behavioral classification from orders instead.';
