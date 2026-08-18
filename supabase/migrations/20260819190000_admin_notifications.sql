-- 20260819190000_admin_notifications
--
-- WHY: an admin currently only finds out about a new order or a new recurring
-- order request by manually opening /orders or /recurring. This adds a
-- durable, admin-only notification feed (bell icon + unread count in the
-- panel) for exactly the two events the owner asked for: a new order landing
-- (any channel) and a customer's recurring-order approval request.
--
-- Read state is a single shared `read_at`, not per-admin — this shop runs
-- with one or a small handful of admin accounts, and a notification-reads
-- join table would be solving a problem this team doesn't have yet.
--
-- Writes come from app code via the service-role client (same pattern as
-- audit_log / logAudit) — the customer-facing flows that create these rows
-- (place-order.ts, send-order-confirmation.ts, recurring-order-request.ts)
-- run without an admin session, so RLS only needs an admin-read/-update
-- policy; there is no anon/authenticated insert policy at all.

create table notifications (
  id uuid primary key default uuid_generate_v4(),

  type text not null check (type in ('order_created', 'recurring_request')),
  title text not null check (length(title) between 1 and 200),
  body text not null check (length(body) between 1 and 500),
  -- App-relative path the bell item navigates to on click, e.g. "/orders/<id>".
  link text not null check (length(link) between 1 and 300),

  -- Exactly one of these is set, matching `type`. Cascades so a hard-deleted
  -- order/template doesn't leave a dead notification pointing nowhere.
  order_id uuid references orders(id) on delete cascade,
  recurring_template_id uuid references recurring_templates(id) on delete cascade,
  constraint notifications_entity_matches_type check (
    (type = 'order_created' and order_id is not null and recurring_template_id is null) or
    (type = 'recurring_request' and recurring_template_id is not null and order_id is null)
  ),

  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Bell badge = count of unread; partial index keeps that count cheap forever
-- regardless of how large the read history grows (CLAUDE.md §1).
create index notifications_unread_idx
  on notifications (created_at desc) where read_at is null;
create index notifications_created_at_idx
  on notifications (created_at desc);

alter table notifications enable row level security;

create policy notifications_admin_all on notifications
  for all to authenticated using (is_admin()) with check (is_admin());

comment on table notifications is
  'Admin-only notification feed (panel bell icon). Written by service-role from customer-facing flows (new order, new recurring request); read/marked-read by admins via RLS.';
comment on column notifications.read_at is
  'Shared read state, not per-admin — null means unread. Set by markNotificationReadAction.';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
