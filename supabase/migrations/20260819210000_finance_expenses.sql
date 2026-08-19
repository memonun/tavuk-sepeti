-- 20260819210000_finance_expenses
--
-- Manual business expense tracking for the new Finans admin section (SPEC.md
-- has no §3.x for this yet — it's a Faz-1.5 operational-visibility feature,
-- not accounting software: no ledger, no VAT, no double-entry).
--
-- `category` is deliberately free text, not an enum — the business wants to
-- add categories later without a migration. The UI seeds a suggested list
-- (Yakıt, Ambalaj, Kargo, ...) and allows free text on top of it.
--
-- payment_status/payment_method are separate from orders' payment_channel:
-- that enum has no 'other' and is scoped to online-order collection, and
-- CLAUDE.md's migration-safety rule warns against reshaping a shared enum's
-- semantics for an unrelated domain (expenses are never paid by the customer).

create type manual_payment_method as enum ('cash', 'card', 'bank_transfer', 'other');
create type expense_payment_status as enum ('paid', 'pending');

create table expenses (
  id uuid primary key default uuid_generate_v4(),

  category text not null check (length(category) between 1 and 100),
  amount_minor bigint not null check (amount_minor > 0), -- kuruş, CLAUDE.md §7
  expense_date date not null,
  description text check (description is null or length(description) <= 500),

  payment_status expense_payment_status not null default 'pending',
  payment_method manual_payment_method,

  vendor text check (vendor is null or length(vendor) <= 200),
  note text check (note is null or length(note) <= 500),

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table expenses is
  'Manually recorded business expenses (fuel, packaging, maintenance, ...) for the Finans admin section. Originates outside the online order flow, so it needs its own record.';

create index expenses_date_idx on expenses (expense_date);
create index expenses_category_idx on expenses (category);
create index expenses_payment_status_idx on expenses (payment_status);

alter table expenses enable row level security;
create policy expenses_admin_all on expenses
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));

-- Reuses the existing set_updated_at() trigger function (products/003).
create trigger expenses_set_updated_at
  before update on expenses
  for each row execute function set_updated_at();
