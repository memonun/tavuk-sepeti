-- 20260819220000_order_estimated_delivery
--
-- Persists the dwell-aware per-stop ETA the admin's route-optimization flow
-- already computes (features/routing/domain/route-schedule.ts), so the
-- customer-facing guest order lookup can show "tahmini teslimat saati"
-- without any new Google API call — it just reads what optimization already
-- produced. A flat estimate (10 min/stop, no live GPS), owner instruction
-- 2026-08-19: no extra API load/cost for this.
--
-- estimated_delivery_computed_at is separate from estimated_delivery_at so
-- the customer-facing UI can show freshness ("14:30 dolaylarında — son
-- güncelleme 09:15") rather than presenting a flat estimate as if it were
-- live tracking. Delivery-channel orders only — cargo orders never go
-- through /routes, so this stays null for them (the storefront gates
-- display on fulfillment_channel = 'delivery' regardless).

alter table orders
  add column estimated_delivery_at timestamptz,
  add column estimated_delivery_computed_at timestamptz;

comment on column orders.estimated_delivery_at is
  'Dwell-aware ETA from the admin route-optimization flow (route-schedule.ts). A flat estimate, not live tracking. Null until the order has been through an optimized route at least once.';
comment on column orders.estimated_delivery_computed_at is
  'When estimated_delivery_at was last (re)computed — drives the "as of HH:mm" freshness note on the customer-facing lookup.';

-- Batched write for the whole day's optimized stops in one round trip — same
-- security-invoker + RLS-applies precedent as count_orders_by_customers
-- (20260608120002): the admin's own session already has UPDATE rights via
-- orders_admin_all, so this doesn't need SECURITY DEFINER.
create or replace function public.set_order_eta_batch(
  p_order_ids uuid[],
  p_eta_times timestamptz[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update orders o
  set estimated_delivery_at = v.eta,
      estimated_delivery_computed_at = now()
  from unnest(p_order_ids, p_eta_times) as v(order_id, eta)
  where o.id = v.order_id;
end;
$$;

comment on function public.set_order_eta_batch(uuid[], timestamptz[]) is
  'Bulk-writes estimated_delivery_at for every stop in one optimized route (called from get-day-route.ts after Google Directions returns). security invoker — relies on the calling admin session''s existing UPDATE rights via orders_admin_all.';
