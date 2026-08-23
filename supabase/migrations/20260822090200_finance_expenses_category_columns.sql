-- 20260822090200_finance_expenses_category_columns
--
-- Adds the managed-category FK and optional quantity/unit (Birim Maliyet,
-- spec §7) to expenses. All additive/loosening changes:
--   - category_id is nullable at the DB level, forever — required only by
--     the Zod schema for new writes (features/finance/domain/expense.schema.ts).
--     This sidesteps the exact "new required column during the Vercel/
--     migration-gate deploy window" trap CLAUDE.md §7 calls out by name:
--     old app code mid-deploy keeps writing `category` text and never
--     touches category_id, which is fine because nothing requires it yet.
--   - `category` (the free-text column) is relaxed from NOT NULL to nullable
--     — a pure loosening, safe regardless of deploy ordering — and kept
--     indefinitely as the pre-V2 historical snapshot. New code stops writing
--     it; nothing drops it.
--
-- on delete restrict on category_id: a category with expenses attached can
-- never be hard-deleted out from under them (spec §4/§6 — archive instead).

alter table expenses
  add column category_id uuid references expense_categories(id) on delete restrict,
  add column quantity numeric(12, 3) check (quantity is null or quantity > 0),
  add column unit text check (unit is null or unit in ('kg', 'litre', 'adet', 'koli', 'paket', 'ton'));

create index expenses_category_id_idx on expenses (category_id);

alter table expenses alter column category drop not null;

alter table expenses drop constraint if exists expenses_category_check;
alter table expenses add constraint expenses_category_check
  check (category is null or length(category) between 1 and 100);

comment on column expenses.category is
  'Pre-Finance-V2 historical snapshot (free text). No longer written by new code — see category_id.';
comment on column expenses.category_id is
  'Managed category (features/finance/domain/expense-category.ts). Nullable at the DB level; required by the Zod schema for new writes.';
