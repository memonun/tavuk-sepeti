-- 20260822090000_finance_expense_categories
--
-- Finance V2: replaces expenses' free-text `category` with a managed,
-- two-level category system so spending can actually be aggregated ("Bu ay
-- tavuk yemine ne kadar harcadık?" needs one "Tavuk Yemi" bucket, not
-- "Yem"/"Tavuk Yemi"/"Yem Gideri" as separate strings). See
-- 20260819210000_finance_expenses.sql's own header for why category was
-- free text in V1 — this migration is the promised follow-up.
--
-- Exactly two levels: a top-level category (Ana Kategori) has
-- parent_id = null; a child (Alt Kategori) points at a top-level category.
-- A category whose OWN parent_id is non-null can never itself be used as a
-- parent — enforced by the trigger below, mirrored in TS by
-- features/finance/domain/expense-category.ts (canBeParent).
--
-- system_key is a stable ascii handle used only by the upcoming legacy-data
-- backfill migration to find specific seeded rows (e.g. "the Tavuk Yemi
-- category") without hardcoding UUIDs anywhere in application code or SQL.
-- Categories created by an admin through the UI always have system_key null.

create table expense_categories (
  id uuid primary key default uuid_generate_v4(),

  name text not null check (length(name) between 1 and 100),
  parent_id uuid references expense_categories(id) on delete restrict,
  system_key text unique,

  active boolean not null default true,
  sort_order int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table expense_categories is
  'Managed expense category tree (max two levels: Ana Kategori -> Alt Kategori) for the Finans admin section. Replaces expenses.category free text.';

create index expense_categories_parent_id_idx on expense_categories (parent_id);
create index expense_categories_active_idx on expense_categories (active);

-- Hard two-level cap: a row cannot reference a parent that itself has a
-- parent. Belt-and-suspenders alongside the same check in the Zod/domain
-- layer (CLAUDE.md §11 — state-machine-shaped invariants get both).
create or replace function expense_categories_enforce_depth()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_parent_parent_id uuid;
begin
  if new.parent_id is not null then
    select parent_id into v_parent_parent_id
    from expense_categories
    where id = new.parent_id;

    if v_parent_parent_id is not null then
      raise exception 'expense_categories: max two levels — % is already a child category and cannot be used as a parent', new.parent_id
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger expense_categories_enforce_depth_trigger
  before insert or update of parent_id on expense_categories
  for each row execute function expense_categories_enforce_depth();

-- Reuses the existing set_updated_at() trigger function (products/003).
create trigger expense_categories_set_updated_at
  before update on expense_categories
  for each row execute function set_updated_at();

alter table expense_categories enable row level security;
create policy expense_categories_admin_all on expense_categories
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));

-- Explicit grants — the platform default ACL is not to be trusted for new
-- objects in this project; see 20260820100000_finance_and_routing_grants.sql
-- for the incident that made this mandatory going forward.
grant select, insert, update, delete on table public.expense_categories to authenticated;
