-- 008_create_order_status_events
-- SPEC.md §3.6 — append-only audit trail of every state-machine transition.
--
-- Insert-only by design: app code writes one row per transition via the
-- transitionOrder() reducer. We don't update or delete events.

create table order_status_events (
  id uuid primary key default uuid_generate_v4(),

  order_id uuid not null references orders(id) on delete cascade,

  -- Nullable on the very first event (creation): there's no prior state.
  from_status order_status,
  to_status order_status not null,
  -- Free text reason — required for cancellations, optional otherwise.
  -- Domain layer enforces presence rules.
  reason text check (reason is null or length(reason) <= 1000),
  actor_id uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now()
);
