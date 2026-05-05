-- 004_create_customers
-- SPEC.md §3.3
--
-- phone is the customer's primary identity (more reliable than email in TR).
-- Stored E.164 (+90...) — the app layer normalizes before insert.
-- email is optional and lowercased; uniqueness is enforced only when present.

create table customers (
  id uuid primary key default uuid_generate_v4(),

  first_name text not null
    check (length(trim(first_name)) between 1 and 100),
  last_name text not null
    check (length(trim(last_name)) between 1 and 100),

  -- Optional. Unique-when-present via partial unique index below.
  email text
    check (email is null or email = lower(email)),

  -- Required. E.164 (+90...) — exactly one record per phone number.
  phone text not null
    check (phone ~ '^\+[1-9][0-9]{6,14}$'),

  notes text check (notes is null or length(notes) <= 2000),

  status customer_status not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- App user (admin) who created the row. References auth.users; restrict
  -- delete so we don't lose audit attribution if an admin is removed.
  created_by uuid references auth.users(id) on delete restrict
);

-- Unique phone — global, no soft-delete carve-out yet (we don't soft-delete).
create unique index customers_phone_unique on customers (phone);

-- Email unique only when present. Filtered unique index = standard PG idiom
-- for "unique if not null".
create unique index customers_email_unique
  on customers (email)
  where email is not null;

create trigger customers_set_updated_at
  before update on customers
  for each row execute function set_updated_at();

comment on column customers.phone is 'E.164 format, +90... — uniqueness enforced.';
comment on column customers.created_by is 'auth.users.id of the admin who created this row.';
