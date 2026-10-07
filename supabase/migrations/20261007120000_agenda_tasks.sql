-- 20261007120000_agenda_tasks
--
-- Ajanda — the owner's own work tracker inside the admin panel: a weekly
-- calendar, to-dos, and animal-health chores (aşı, parazit ilacı, kümes
-- temizliği). Purely additive: one new table, nothing existing is altered, so
-- code that predates this migration is unaffected during the deploy window
-- (CLAUDE.md §7 backward-compat rule).
--
-- category is text + CHECK rather than a Postgres enum: the list is fixed in
-- code (features/agenda/domain/agenda-task.ts) and growing it later is a
-- single drop/re-add of the named constraint below, with no enum-value
-- ordering or "ALTER TYPE ... ADD VALUE inside a transaction" concerns.
--
-- due_date is a `date`, not timestamptz: an agenda item is a calendar day in
-- Europe/Istanbul ("Pazartesi kümes temizliği"), not an instant — the same
-- reasoning as expenses.expense_date. Nullable: an undated to-do lives only in
-- the "Tarihsiz yapılacaklar" list, never on the calendar.
--
-- Recurrence: repeat_unit + repeat_every (both null = one-off). Completing a
-- recurring task creates its next occurrence; the date math lives in
-- features/agenda/domain/recurrence.ts. recurrence_parent_id's UNIQUE
-- constraint is what makes that spawn idempotent: a double tap, a retried
-- request, or un-completing and re-completing a task can never produce two
-- "next" rows for the same occurrence (the insert is ON CONFLICT DO NOTHING).

create table agenda_tasks (
  id uuid primary key default uuid_generate_v4(),

  title text not null check (length(title) between 1 and 200),
  notes text check (notes is null or length(notes) <= 1000),

  category text not null default 'genel'
    constraint agenda_tasks_category_check
    check (category in ('genel', 'hayvan_sagligi', 'kumes_bakimi', 'satis_teslimat', 'alisveris')),

  due_date date,

  repeat_unit text
    constraint agenda_tasks_repeat_unit_check
    check (repeat_unit in ('day', 'week', 'month')),
  repeat_every smallint check (repeat_every between 1 and 365),

  -- Null while open; set when the owner ticks the task off.
  completed_at timestamptz,

  -- The occurrence this row was generated from. ON DELETE SET NULL: deleting
  -- an old, completed occurrence must not take the live next one with it.
  recurrence_parent_id uuid
    constraint agenda_tasks_recurrence_parent_id_key unique
    references agenda_tasks(id) on delete set null,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A repeat rule is all-or-nothing, and needs a date to count from.
  constraint agenda_tasks_repeat_pair_check
    check ((repeat_unit is null) = (repeat_every is null)),
  constraint agenda_tasks_repeat_needs_date_check
    check (repeat_unit is null or due_date is not null)
);

comment on table agenda_tasks is
  'Ajanda admin page: the owner''s dated/undated to-dos and recurring farm chores. Completing a recurring row spawns its next occurrence (recurrence_parent_id).';

-- Weekly calendar: every page load reads one Monday–Sunday range by
-- due_date, open and completed rows alike.
create index agenda_tasks_due_date_idx on agenda_tasks (due_date);

-- Backlog panel: open rows that are overdue (due_date < today) or undated
-- (due_date is null). Partial, so completed history — which only grows —
-- never bloats the index this hot query scans.
create index agenda_tasks_open_due_date_idx on agenda_tasks (due_date)
  where completed_at is null;

-- recurrence_parent_id is already indexed by its UNIQUE constraint, which
-- also covers the FK's ON DELETE SET NULL lookup.

alter table agenda_tasks enable row level security;
create policy agenda_tasks_admin_all on agenda_tasks
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));

-- Explicit grant: this project's migration-runner role has a restrictive
-- default ACL for new tables (see 20260820100000_finance_and_routing_grants).
-- RLS above still gates every row; the grant is necessary, not a bypass.
grant select, insert, update, delete on table public.agenda_tasks to authenticated;

-- Reuses the existing set_updated_at() trigger function (products/003).
create trigger agenda_tasks_set_updated_at
  before update on agenda_tasks
  for each row execute function set_updated_at();
