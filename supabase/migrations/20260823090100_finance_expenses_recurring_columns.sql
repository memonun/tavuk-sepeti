-- 20260823090100_finance_expenses_recurring_columns
--
-- Wires generated recurring expenses back to their template, mirroring
-- orders.source/orders.recurring_template_id + the partial unique dedupe
-- index from 20260622140000_orders_recurring_dedupe.sql exactly. A template
-- can never produce two expense rows for the same expense_date — enforced
-- at the DB level, not just in application code (spec §13).
--
-- on delete restrict (not set null, unlike orders): deleting a template
-- that already generated expenses must be blocked outright so a hard delete
-- can never silently orphan historical spend records — the UI only offers
-- Durdur/Devam Ettir for a template with history (spec §16).

alter table expenses
  add column source text not null default 'manual' check (source in ('manual', 'recurring_generated')),
  add column recurring_template_id uuid references recurring_expense_templates(id) on delete restrict;

create index expenses_recurring_template_id_idx on expenses (recurring_template_id);

create unique index expenses_recurring_dedupe_idx
  on expenses (recurring_template_id, expense_date)
  where source = 'recurring_generated' and recurring_template_id is not null;

comment on column expenses.source is
  'manual (admin-entered) or recurring_generated (materialized from a recurring_expense_templates row).';
