-- 20260622140000_orders_recurring_dedupe
-- Partial unique index: a recurring template cannot generate more than one
-- order for a given scheduled date.  This is the idempotency hard-wall for
-- the lazy generator — even if the generator fires twice concurrently, the
-- second insert will hit a unique_violation which the RPC catches gracefully.

create unique index orders_recurring_dedupe_idx
  on orders (recurring_template_id, scheduled_for)
  where source = 'recurring_generated' and recurring_template_id is not null;
