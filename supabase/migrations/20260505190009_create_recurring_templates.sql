-- 009_create_recurring_templates
-- SPEC.md §3.7 — schema only (Faz 2 hazırlık).
--
-- Faz 1 leaves this table empty; Faz 2 cron generates orders from it. Adding
-- the FK from orders.recurring_template_id NOW (not later) means a future
-- migration doesn't have to alter orders to wire the relationship.

create table recurring_templates (
  id uuid primary key default uuid_generate_v4(),

  customer_id uuid not null references customers(id) on delete cascade,

  cadence recurring_cadence not null,
  -- 0=Sunday..6=Saturday for 'weekly'/'biweekly' templates; null for 'monthly'.
  day_of_week smallint check (day_of_week is null or day_of_week between 0 and 6),
  -- 1..31 for 'monthly' templates; null for 'weekly'/'biweekly'.
  day_of_month smallint check (day_of_month is null or day_of_month between 1 and 31),

  -- Cadence-shape invariant: weekly/biweekly use day_of_week; monthly uses
  -- day_of_month. Exactly one of the two is set.
  constraint recurring_cadence_shape check (
    (cadence in ('weekly', 'biweekly') and day_of_week is not null and day_of_month is null)
    or (cadence = 'monthly' and day_of_month is not null and day_of_week is null)
  ),

  -- [{product_key, quantity}, ...] — frozen list materialized into orders
  -- by the cron generator. Domain layer validates against products on edit.
  items jsonb not null,

  active boolean not null default true,
  next_run_at timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger recurring_templates_set_updated_at
  before update on recurring_templates
  for each row execute function set_updated_at();

-- Wire the forward FK declared in 006_orders.
alter table orders
  add constraint orders_recurring_template_id_fkey
  foreign key (recurring_template_id)
  references recurring_templates(id)
  on delete set null;
