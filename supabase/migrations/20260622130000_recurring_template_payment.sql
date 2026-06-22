-- 20260622130000_recurring_template_payment
-- Per-template payment method for recurring (Faz 2) orders. Each subscription
-- carries its own payment method; the lazy generator stamps it onto the order
-- it materializes. recurring_templates is empty in Faz 1, so the default only
-- guards any future backfill. RLS is already enabled on the table (migration
-- 011, recurring_templates_admin_all) — untouched here.

alter table recurring_templates
  add column if not exists payment_method payment_method not null default 'cash_on_delivery';
