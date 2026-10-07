-- 20261007120000_planner_tasks
--
-- Admin's personal weekly planner — "haftamı ve işlerimi planlamak için"
-- (owner request). Entirely separate from the business domain: no
-- customer, order or route ever references this table, and this table
-- never references them either. Self-contained per CLAUDE.md §2.
--
-- Shape mirrors customer_views (20260524180000): per-owner rows, no
-- shared/team tasks in Faz 1, config kept minimal on purpose — this is a
-- to-do list, not a project-management tool.
--
-- `scheduled_date` null = backlog (not yet assigned to a day); set = that
-- Istanbul calendar day on the weekly board. Nothing here is customer-
-- facing and nothing here feeds route/order logic.

create table planner_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  -- Free-form detail, optional. Capped generously above the UI's own limit
  -- (1000) only as a hard backstop, same posture as customer_views.name.
  notes text check (notes is null or length(notes) <= 2000),
  -- Null = backlog/unscheduled. A real column (not jsonb) because the week
  -- view filters and groups by it directly.
  scheduled_date date,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Primary query: "this owner's tasks for the visible week", plus the
-- backlog list (scheduled_date is null) — both hit this same index.
create index planner_tasks_owner_date_idx
  on planner_tasks (owner_id, scheduled_date);

-- Reuses the set_updated_at() function defined in 003_create_products.sql.
create trigger planner_tasks_set_updated_at
  before update on planner_tasks
  for each row execute function set_updated_at();

-- ---- RLS ------------------------------------------------------------
-- Per CLAUDE.md §7: RLS on every table. A personal planner has no
-- business being shared — owner-only, same model as customer_views.

alter table planner_tasks enable row level security;

create policy planner_tasks_select_own
  on planner_tasks for select
  using (owner_id = auth.uid());

create policy planner_tasks_insert_own
  on planner_tasks for insert
  with check (owner_id = auth.uid());

create policy planner_tasks_update_own
  on planner_tasks for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy planner_tasks_delete_own
  on planner_tasks for delete
  using (owner_id = auth.uid());

comment on table planner_tasks is
  'Per-admin personal weekly planner / to-do list. Not customer- or order-facing. RLS: owner-only.';
