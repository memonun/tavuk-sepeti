-- 014_app_users_bootstrap_trigger
--
-- Faz 1 convenience: when a new auth.users row is created, mirror it into
-- public.app_users with role='admin'. Without this row the is_admin() RLS
-- check fails and the new user can't see anything — chicken-and-egg.
--
-- Faz 2 will lock signup down (route gating, role assignment via invite),
-- at which point this trigger is replaced by an explicit invite flow.

create or replace function bootstrap_app_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_users (id, role)
  values (new.id, 'admin')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function bootstrap_app_user();

comment on function bootstrap_app_user() is
  'Faz 1: every new auth.users row gets an admin app_users row. Replace with invite flow in Faz 2.';
