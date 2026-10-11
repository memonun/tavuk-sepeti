-- takvim_ve_animsaticilar
--
-- Takvim (/takvim) and Anımsatıcılar (/animsaticilar): the two admin pages that
-- replace Planlayıcı and Ajanda (owner request, 2026-10-11 — "Apple'ın takvim ve
-- anımsatıcı uygulaması gibi"). Shared by every admin, not per-user: this is the
-- farm's calendar, the same model agenda_tasks had.
--
-- Purely additive (CLAUDE.md §7 backward-compat rule): five new tables, three new
-- functions, one new nullable column + two widened CHECKs on notifications. Code
-- that predates this migration keeps working during the deploy window. The old
-- planner_tasks / agenda_tasks tables are deliberately NOT dropped here — both are
-- empty, but the still-running old pages read them until the new code ships; they
-- go in a follow-up PR.
--
-- Time model: every instant is timestamptz (§7). An all-day event/reminder stores
-- the Europe/Istanbul midnight of its day (and, for events, an EXCLUSIVE end at the
-- midnight after its last day); the app layer does the Istanbul conversion.
--
-- Recurrence, two different shapes on purpose:
--   * calendar_events: the row is the SERIES. Occurrences are expanded on read
--     (features/calendar/domain/occurrences.ts); a single skipped day is a row in
--     calendar_event_exceptions.
--   * reminders: each occurrence is its own row. Completing a repeating reminder
--     inserts the next one, idempotently via the UNIQUE recurrence_parent_id — the
--     model agenda_tasks used (features/reminders/domain/recurrence.ts).

-- ---- Takvim ------------------------------------------------------------------

create table calendars (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  -- Fixed palette, resolved to a hex in shared/palette/accent-colors.ts. text +
  -- named CHECK rather than an enum: growing it is one drop/re-add, with no
  -- "ALTER TYPE ... ADD VALUE inside a transaction" concerns.
  color text not null default 'blue'
    constraint calendars_color_check
    check (color in ('red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink', 'brown', 'gray')),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table calendars is
  'Takvim page: a named, colored calendar events belong to. Shared by all admins.';

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  -- Deleting a calendar deletes its events (the UI confirms first), as in Apple
  -- Calendar — an event cannot exist without a calendar to color it.
  calendar_id uuid not null references calendars(id) on delete cascade,

  title text not null check (length(trim(title)) between 1 and 200),
  notes text check (notes is null or length(notes) <= 2000),
  location text check (location is null or length(location) <= 200),

  all_day boolean not null default false,
  starts_at timestamptz not null,
  -- Exclusive. For all_day rows: the Istanbul midnight AFTER the last day.
  ends_at timestamptz not null,

  -- Null pair = one-off. The first occurrence is starts_at itself.
  repeat_unit text
    constraint calendar_events_repeat_unit_check
    check (repeat_unit in ('day', 'week', 'month', 'year')),
  repeat_every smallint check (repeat_every between 1 and 365),
  -- Last Istanbul calendar day an occurrence may START on; null = forever.
  repeat_until date,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_events_range_check check (ends_at > starts_at),
  constraint calendar_events_repeat_pair_check
    check ((repeat_unit is null) = (repeat_every is null)),
  constraint calendar_events_repeat_until_check
    check (repeat_until is null or repeat_unit is not null)
);

comment on table calendar_events is
  'Takvim page: an event, or — when repeat_unit is set — a whole repeating series expanded on read.';

-- Every page load reads one visible range (a day, a week, or a 6-week month
-- grid) of one-off events: starts_at < range_end AND ends_at > range_start.
create index calendar_events_starts_at_idx
  on calendar_events (starts_at) where repeat_unit is null;

-- Repeating series are read separately (every series that started before the
-- range ends) and are few; partial so the one-off history never bloats it.
create index calendar_events_repeating_idx
  on calendar_events (starts_at) where repeat_unit is not null;

-- FK lookup for ON DELETE CASCADE from calendars.
create index calendar_events_calendar_id_idx on calendar_events (calendar_id);

create table calendar_event_exceptions (
  event_id uuid not null references calendar_events(id) on delete cascade,
  -- The Istanbul calendar day of the skipped occurrence's start.
  occurrence_date date not null,
  created_at timestamptz not null default now(),
  -- The PK is also what makes "skip this occurrence" idempotent (double tap).
  primary key (event_id, occurrence_date)
);

comment on table calendar_event_exceptions is
  'One row = one occurrence of a repeating calendar_events series that was deleted on its own.';

-- ---- Anımsatıcılar -----------------------------------------------------------

create table reminder_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  color text not null default 'blue'
    constraint reminder_lists_color_check
    check (color in ('red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink', 'brown', 'gray')),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table reminder_lists is
  'Anımsatıcılar page: a named, colored list reminders belong to. Shared by all admins.';

create table reminders (
  id uuid primary key default gen_random_uuid(),
  -- Deleting a list deletes its reminders (the UI confirms first).
  list_id uuid not null references reminder_lists(id) on delete cascade,

  title text not null check (length(trim(title)) between 1 and 200),
  notes text check (notes is null or length(notes) <= 2000),

  -- Null = no date. due_all_day true = "that day" (Istanbul midnight stored),
  -- false = that exact time.
  due_at timestamptz,
  due_all_day boolean not null default true,

  -- 0 none, 1 low, 2 medium, 3 high — Apple's !, !!, !!!.
  priority smallint not null default 0 check (priority between 0 and 3),
  flagged boolean not null default false,

  repeat_unit text
    constraint reminders_repeat_unit_check
    check (repeat_unit in ('day', 'week', 'month', 'year')),
  repeat_every smallint check (repeat_every between 1 and 365),

  -- Null while open.
  completed_at timestamptz,
  -- Set once the "due" bell notification was created (or once it is known none
  -- is owed); maintained by reminders_sync_notified_at below.
  notified_at timestamptz,

  -- The occurrence this row was generated from. ON DELETE SET NULL: deleting an
  -- old, completed occurrence must not take the live next one with it.
  recurrence_parent_id uuid
    constraint reminders_recurrence_parent_id_key unique
    references reminders(id) on delete set null,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reminders_repeat_pair_check
    check ((repeat_unit is null) = (repeat_every is null)),
  constraint reminders_repeat_needs_due_check
    check (repeat_unit is null or due_at is not null)
);

comment on table reminders is
  'Anımsatıcılar page: one reminder. Completing a repeating one spawns its next occurrence (recurrence_parent_id).';

-- A list's open reminders, in the order the page shows them. Partial: completed
-- history only grows and must never bloat the index the hot query scans.
create index reminders_list_open_idx
  on reminders (list_id, created_at) where completed_at is null;

-- "Bugün" and "Planlanan" smart lists: open, dated reminders by due time.
create index reminders_open_due_at_idx
  on reminders (due_at) where completed_at is null and due_at is not null;

-- The Takvim page shows every dated reminder (open or done) of its visible range.
create index reminders_due_at_idx
  on reminders (due_at) where due_at is not null;

-- "Tamamlanan" smart list, newest first, paginated.
create index reminders_completed_at_idx
  on reminders (completed_at desc) where completed_at is not null;

-- materialize_due_reminder_notifications(): the handful of open reminders that
-- still owe a notification. Stays tiny no matter how many reminders exist.
create index reminders_pending_notification_idx
  on reminders (due_at)
  where completed_at is null and notified_at is null and due_at is not null;

-- When a reminder should raise its bell notification: a timed one at its time, an
-- all-day one at 09:00 Istanbul (due_at is that day's Istanbul midnight).
create function reminder_notify_at(p_due_at timestamptz, p_all_day boolean)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case when p_all_day then p_due_at + interval '9 hours' else p_due_at end;
$$;

-- Called by the trigger below and by materialize_due_reminder_notifications(),
-- both of which run as the signed-in admin.
grant execute on function public.reminder_notify_at(timestamptz, boolean) to authenticated;

-- Keeps notified_at honest whenever the due time is set or moved: a reminder
-- whose notification moment already passed is marked as settled (adding
-- "yesterday's" reminder must not ring the bell), anything else is re-armed.
create function reminders_sync_notified_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or new.due_at is distinct from old.due_at
     or new.due_all_day is distinct from old.due_all_day then
    new.notified_at := case
      when new.due_at is null then null
      when reminder_notify_at(new.due_at, new.due_all_day) <= now() then now()
      else null
    end;
  end if;
  return new;
end;
$$;

create trigger reminders_sync_notified_at
  before insert or update on reminders
  for each row execute function reminders_sync_notified_at();

-- ---- updated_at (reuses set_updated_at() from 003_create_products.sql) -------

create trigger calendars_set_updated_at
  before update on calendars
  for each row execute function set_updated_at();
create trigger calendar_events_set_updated_at
  before update on calendar_events
  for each row execute function set_updated_at();
create trigger reminder_lists_set_updated_at
  before update on reminder_lists
  for each row execute function set_updated_at();
create trigger reminders_set_updated_at
  before update on reminders
  for each row execute function set_updated_at();

-- ---- RLS + grants ------------------------------------------------------------
-- Admin-only, every table (§7). The explicit grants are required: this project's
-- migration-runner role has a restrictive default ACL for new tables (see
-- 20260820100000_finance_and_routing_grants). RLS still gates every row.

alter table calendars enable row level security;
create policy calendars_admin_all on calendars
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));
grant select, insert, update, delete on table public.calendars to authenticated;

alter table calendar_events enable row level security;
create policy calendar_events_admin_all on calendar_events
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));
grant select, insert, update, delete on table public.calendar_events to authenticated;

alter table calendar_event_exceptions enable row level security;
create policy calendar_event_exceptions_admin_all on calendar_event_exceptions
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));
grant select, insert, update, delete on table public.calendar_event_exceptions to authenticated;

alter table reminder_lists enable row level security;
create policy reminder_lists_admin_all on reminder_lists
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));
grant select, insert, update, delete on table public.reminder_lists to authenticated;

alter table reminders enable row level security;
create policy reminders_admin_all on reminders
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));
grant select, insert, update, delete on table public.reminders to authenticated;

-- ---- Bell notifications for due reminders --------------------------------------

alter table notifications
  add column reminder_id uuid references reminders(id) on delete cascade;

-- Both CHECKs are widened, never narrowed: every row the old code writes
-- (order_created / recurring_request, reminder_id null) still satisfies them.
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('order_created', 'recurring_request', 'reminder_due'));

alter table notifications drop constraint notifications_entity_matches_type;
alter table notifications add constraint notifications_entity_matches_type check (
  (type = 'order_created' and order_id is not null and recurring_template_id is null and reminder_id is null) or
  (type = 'recurring_request' and recurring_template_id is not null and order_id is null and reminder_id is null) or
  (type = 'reminder_due' and reminder_id is not null and order_id is null and recurring_template_id is null)
);

-- FK lookup for ON DELETE CASCADE from reminders; partial because almost every
-- notification is an order one.
create index notifications_reminder_id_idx
  on notifications (reminder_id) where reminder_id is not null;

-- Turns every reminder whose moment has come into one bell notification, and
-- reports when the next one is owed so the panel can come back exactly then.
-- No cron in this project (see materialize-due-recurring-expenses.ts): the open
-- admin panel calls this — on load and again at next_due_at.
--
-- Safe to call concurrently from several tabs/admins: the UPDATE claims each
-- reminder (notified_at) and the INSERT runs off its RETURNING in the same
-- statement, so a reminder can never produce two notifications or be claimed
-- without one. SECURITY INVOKER: RLS limits it to admins like any other write.
create function materialize_due_reminder_notifications()
returns table (created integer, next_due_at timestamptz)
language sql
volatile
security invoker
set search_path = public
as $$
  with claimed as (
    update reminders r
    set notified_at = now()
    where r.completed_at is null
      and r.notified_at is null
      and r.due_at is not null
      -- Sargable pre-filter for reminders_pending_notification_idx; the exact
      -- moment (09:00 for all-day) is the next line.
      and r.due_at <= now()
      and reminder_notify_at(r.due_at, r.due_all_day) <= now()
    returning r.id, r.list_id, r.title, r.due_at, r.due_all_day
  ),
  inserted as (
    insert into notifications (type, title, body, link, reminder_id)
    select
      'reminder_due',
      left('Anımsatıcı: ' || c.title, 200),
      left(
        l.name || ' · ' ||
        case
          when c.due_all_day then to_char(c.due_at at time zone 'Europe/Istanbul', 'DD.MM.YYYY')
          else to_char(c.due_at at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI')
        end,
        500
      ),
      '/animsaticilar?liste=' || c.list_id::text,
      c.id
    from claimed c
    join reminder_lists l on l.id = c.list_id
    returning 1
  )
  select
    (select count(*)::integer from inserted),
    (
      select min(reminder_notify_at(r.due_at, r.due_all_day))
      from reminders r
      where r.completed_at is null
        and r.notified_at is null
        and r.due_at is not null
        and reminder_notify_at(r.due_at, r.due_all_day) > now()
    );
$$;

grant execute on function public.materialize_due_reminder_notifications() to authenticated;

comment on function materialize_due_reminder_notifications is
  'Creates the bell notification for every open reminder whose time has come (idempotent, concurrency-safe) and returns the next moment one is owed.';

-- ---- Sidebar counts for the Anımsatıcılar page -----------------------------------

-- One round trip instead of one count query per list (§9: no N+1). p_day_end is
-- the Istanbul midnight that ends "today" — the app layer owns the timezone.
create function reminder_counts(p_day_end timestamptz)
returns table (kind text, list_id uuid, n integer)
language sql
stable
security invoker
set search_path = public
as $$
  select 'list', r.list_id, count(*)::integer
  from reminders r
  where r.completed_at is null
  group by r.list_id
  union all
  -- Overdue reminders count as today's, as in Apple Reminders.
  select 'today', null::uuid, count(*)::integer
  from reminders r
  where r.completed_at is null and r.due_at is not null and r.due_at < p_day_end
  union all
  select 'scheduled', null::uuid, count(*)::integer
  from reminders r
  where r.completed_at is null and r.due_at is not null
  union all
  select 'flagged', null::uuid, count(*)::integer
  from reminders r
  where r.completed_at is null and r.flagged;
$$;

grant execute on function public.reminder_counts(timestamptz) to authenticated;

comment on function reminder_counts is
  'Open-reminder counts for the Anımsatıcılar sidebar: one row per list (kind=list) plus the today/scheduled/flagged smart lists.';

-- ---- Teslimatlar on the Takvim page --------------------------------------------

-- Per-day delivery totals for the calendar's visible range, aggregated in the
-- database so the page never pulls a month of order rows (§9). Read-only over
-- orders; route-channel orders only (cargo has no delivery day on the route).
-- Served by orders_channel_scheduled_idx (fulfillment_channel, scheduled_for).
create function delivery_counts_by_day(p_from date, p_to date)
returns table (day date, total integer, delivered integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    o.scheduled_for,
    count(*)::integer,
    (count(*) filter (where o.status = 'delivered'))::integer
  from orders o
  where o.fulfillment_channel = 'delivery'
    and o.scheduled_for between p_from and p_to
    and o.status <> 'cancelled'
  group by o.scheduled_for;
$$;

grant execute on function public.delivery_counts_by_day(date, date) to authenticated;

comment on function delivery_counts_by_day is
  'Non-cancelled route-delivery orders per scheduled day in [p_from, p_to], with how many are already delivered. Feeds the Takvim page.';

-- ---- Realtime ------------------------------------------------------------------
-- So a second admin's open Takvim / Anımsatıcılar page reconciles on its own
-- (shared/realtime/use-table-realtime.ts). postgres_changes is RLS-aware.

do $$
declare
  t text;
begin
  foreach t in array array['calendars', 'calendar_events', 'calendar_event_exceptions', 'reminder_lists', 'reminders']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---- Starting set ----------------------------------------------------------------
-- The five Ajanda categories, carried over with their colors so the pages don't
-- open empty (docs/yedek/2026-10-11-planlayici-ajanda). Ordinary rows: the owner
-- can rename, recolor or delete any of them from the panel.

insert into calendars (name, color, sort_order) values
  ('Genel', 'blue', 0),
  ('Hayvan Sağlığı', 'red', 1),
  ('Kümes Bakımı', 'orange', 2),
  ('Satış / Teslimat', 'teal', 3),
  ('Alışveriş', 'green', 4);

insert into reminder_lists (name, color, sort_order) values
  ('Genel', 'blue', 0),
  ('Hayvan Sağlığı', 'red', 1),
  ('Kümes Bakımı', 'orange', 2),
  ('Satış / Teslimat', 'teal', 3),
  ('Alışveriş', 'green', 4);
