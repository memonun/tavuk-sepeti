-- 011_rls_policies
-- SPEC.md §4.4 — RLS on every table; Faz 1 policy = admin-only via app_users.
--
-- app_users is OUR table. It links to Supabase's built-in auth.users 1-to-1
-- and adds the role enum + display fields. RLS policies key off this table.
-- Service role bypasses RLS by design — all server-side mutating code goes
-- through the service-role client.
--
-- All policies use the is_admin() helper so we can change the rule (e.g.,
-- add operator/viewer access) in one place rather than per-table.

create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'admin',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger app_users_set_updated_at
  before update on app_users
  for each row execute function set_updated_at();

-- ---- Helper: is the current authenticated user an admin? -------------------
-- security definer + stable so policies can call it cheaply.
create or replace function is_admin() returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from app_users
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- Tighten function access. Anonymous can't call it; authenticated calls it
-- via policies. Service role bypasses RLS so doesn't need to.
revoke all on function is_admin() from public;
grant execute on function is_admin() to authenticated;

-- ---- Enable RLS on every table --------------------------------------------
alter table app_users               enable row level security;
alter table products                enable row level security;
alter table customers               enable row level security;
alter table addresses               enable row level security;
alter table orders                  enable row level security;
alter table order_items             enable row level security;
alter table order_status_events     enable row level security;
alter table recurring_templates     enable row level security;
alter table geocoding_cache         enable row level security;
alter table geocoding_api_calls     enable row level security;

-- ---- Policies -------------------------------------------------------------
-- Pattern: "admin can do anything"; service role bypasses RLS so never
-- evaluates these. Anonymous is never granted any policy — implicit deny.

-- app_users: admins manage; users see only their own row (so a future role
-- change can be reflected in UI without leaking other admins' data).
create policy app_users_admin_all on app_users
  for all to authenticated using (is_admin()) with check (is_admin());
create policy app_users_self_select on app_users
  for select to authenticated using (id = auth.uid());

-- All other tables: admin-only.
create policy products_admin_all on products
  for all to authenticated using (is_admin()) with check (is_admin());

create policy customers_admin_all on customers
  for all to authenticated using (is_admin()) with check (is_admin());

create policy addresses_admin_all on addresses
  for all to authenticated using (is_admin()) with check (is_admin());

create policy orders_admin_all on orders
  for all to authenticated using (is_admin()) with check (is_admin());

create policy order_items_admin_all on order_items
  for all to authenticated using (is_admin()) with check (is_admin());

create policy order_status_events_admin_all on order_status_events
  for all to authenticated using (is_admin()) with check (is_admin());

create policy recurring_templates_admin_all on recurring_templates
  for all to authenticated using (is_admin()) with check (is_admin());

create policy geocoding_cache_admin_all on geocoding_cache
  for all to authenticated using (is_admin()) with check (is_admin());

create policy geocoding_api_calls_admin_all on geocoding_api_calls
  for all to authenticated using (is_admin()) with check (is_admin());
