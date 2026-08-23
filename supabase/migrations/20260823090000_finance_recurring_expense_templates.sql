-- 20260823090000_finance_recurring_expense_templates
--
-- Finance V2 — recurring expense templates. A template is a schedule, not a
-- ledger entry: it lazily generates ordinary `expenses` rows (see the next
-- migration for the FK/dedupe wiring), mirroring the architectural shape
-- 20260505190009_create_recurring_templates.sql already established for
-- customer orders. Generated rows always start payment_status='pending' —
-- this table has no payment/status concept of its own (spec §12).
--
-- Cadence-shape invariant mirrors recurring_templates' own CHECK
-- (recurring_cadence_shape): weekly uses day_of_week; every monthly-family
-- cadence (monthly/quarterly/semiannual/yearly) uses day_of_month. Exactly
-- one of the two is set.

create type recurring_expense_cadence as enum ('weekly', 'monthly', 'quarterly', 'semiannual', 'yearly');
create type recurring_expense_amount_type as enum ('fixed', 'variable');

create table recurring_expense_templates (
  id uuid primary key default uuid_generate_v4(),

  name text not null check (length(name) between 1 and 150),
  category_id uuid not null references expense_categories(id) on delete restrict,
  vendor text check (vendor is null or length(vendor) <= 200),
  description text check (description is null or length(description) <= 500),

  amount_type recurring_expense_amount_type not null,
  -- kuruş, CLAUDE.md §7. Doubles as "Sabit Tutar" (fixed) or "Tahmini Tutar"
  -- (variable) depending on amount_type — the generated expense starts at
  -- this figure either way; the admin edits it once the real bill arrives.
  default_amount_minor bigint not null check (default_amount_minor > 0),

  cadence recurring_expense_cadence not null,
  day_of_week smallint check (day_of_week is null or day_of_week between 0 and 6),
  day_of_month smallint check (day_of_month is null or day_of_month between 1 and 31),
  constraint recurring_expense_cadence_shape check (
    (cadence = 'weekly' and day_of_week is not null and day_of_month is null)
    or (cadence in ('monthly', 'quarterly', 'semiannual', 'yearly') and day_of_month is not null and day_of_week is null)
  ),

  start_date date not null,
  end_date date,
  constraint recurring_expense_end_after_start check (end_date is null or end_date >= start_date),

  payment_method manual_payment_method,
  active boolean not null default true,
  note text check (note is null or length(note) <= 500),

  -- Advanced by the materialization driver after each generated occurrence;
  -- also recomputed on resume (setTemplateActive) so a long-paused template
  -- doesn't immediately back-generate every missed period.
  next_run_at timestamptz not null,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table recurring_expense_templates is
  'Recurring expense schedules (Rutin Giderler). Generates ordinary expenses rows lazily — never itself counted in Finance totals.';

create index recurring_expense_templates_category_id_idx on recurring_expense_templates (category_id);
create index recurring_expense_templates_active_next_run_idx on recurring_expense_templates (active, next_run_at);

alter table recurring_expense_templates enable row level security;
create policy recurring_expense_templates_admin_all on recurring_expense_templates
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));

create trigger recurring_expense_templates_set_updated_at
  before update on recurring_expense_templates
  for each row execute function set_updated_at();

grant select, insert, update, delete on table public.recurring_expense_templates to authenticated;
