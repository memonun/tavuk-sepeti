-- 020_create_audit_log
--
-- Cross-entity audit trail. SPEC.md §9.3.
--
-- Every mutating server action should write one row here so we can
-- reconstruct "who did what when" without parsing logs. Distinct from
-- order_status_events (which is a state-machine-specific audit) — this
-- table covers customer / order / address / future-feature mutations
-- under one roof.
--
-- Append-only by convention; nothing in app code updates or deletes rows.

create table audit_log (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references auth.users(id) on delete set null,

  -- Verb + dotted-namespace, e.g. "customer.created", "order.transitioned".
  -- Free string to keep adding actions without enum migrations; lint
  -- happens at the call site (helper takes a typed union).
  action text not null check (length(action) between 1 and 100),

  -- Entity descriptor.
  entity_type text not null check (length(entity_type) between 1 and 50),
  entity_id uuid not null,

  -- Optional snapshots. `before` may be null for create actions; both
  -- may be null when we just want to record the verb (e.g., login event).
  before jsonb,
  after jsonb,
  -- Free-form supplemental data: correlation_id, transition reason,
  -- caller IP, etc. App-layer convention defines what goes here.
  metadata jsonb,

  created_at timestamptz not null default now()
);

create index audit_log_entity_idx
  on audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_idx
  on audit_log (actor_id, created_at desc);
create index audit_log_action_idx
  on audit_log (action, created_at desc);

alter table audit_log enable row level security;

create policy audit_log_admin_all on audit_log
  for all to authenticated using (is_admin()) with check (is_admin());
