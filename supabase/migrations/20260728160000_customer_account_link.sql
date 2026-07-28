-- 20260728160000_customer_account_link
-- Faz 2 — bind a storefront login to its CRM `customers` row at REGISTRATION
-- (not just at first checkout). Two SECURITY DEFINER writers, service_role-only,
-- exactly like place_web_order: the customer's browser never writes `customers`
-- directly (no customer INSERT/UPDATE RLS policy).
--
--   link_customer_account   — idempotent create-or-link used at signup and as a
--                             lazy self-heal for accounts made before this. Reuses
--                             a guest row by phone (unifying history) and backfills
--                             only MISSING fields.
--   update_customer_profile — the account "Bilgilerim" editor: overwrites name +
--                             phone for the caller's own linked row, phone-collision
--                             safe.

-- ---- create-or-link (idempotent) ------------------------------------------
create or replace function link_customer_account(
  p_auth_user_id uuid,
  p_first_name   text,
  p_last_name    text,
  p_phone        text,
  p_email        text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_first text := nullif(trim(coalesce(p_first_name, '')), '');
  v_last  text := nullif(trim(coalesce(p_last_name, '')), '');
begin
  if p_auth_user_id is null then
    raise exception 'auth user id required' using errcode = 'P0001';
  end if;

  -- (1) Already linked → backfill ONLY missing fields (no needless write on
  -- steady-state account loads), then return.
  select id into v_customer_id
  from customers where auth_user_id = p_auth_user_id limit 1;

  if v_customer_id is not null then
    update customers set
      first_name = coalesce(first_name, v_first),
      last_name  = coalesce(last_name, v_last),
      phone = case
        when phone is null and v_phone is not null
             and not exists (select 1 from customers where phone = v_phone)
        then v_phone else phone end,
      email = case
        when email is null and v_email is not null
             and not exists (select 1 from customers where email = v_email)
        then v_email else email end,
      updated_at = now()
    where id = v_customer_id
      and (
        (first_name is null and v_first is not null) or
        (last_name  is null and v_last  is not null) or
        (phone is null and v_phone is not null
           and not exists (select 1 from customers where phone = v_phone)) or
        (email is null and v_email is not null
           and not exists (select 1 from customers where email = v_email))
      );
    return v_customer_id;
  end if;

  -- (2) Claim an existing UNLINKED customer by phone (guest → account merge).
  if v_phone is not null then
    update customers set
      auth_user_id = p_auth_user_id,
      first_name = coalesce(first_name, v_first),
      last_name  = coalesce(last_name, v_last),
      updated_at = now()
    where phone = v_phone and auth_user_id is null
    returning id into v_customer_id;
    if v_customer_id is not null then
      return v_customer_id;
    end if;
  end if;

  -- (3) Create a fresh customer for this login. Drop phone/email that already
  -- belong to someone else so a unique index can't abort the signup.
  if v_phone is not null and exists (select 1 from customers where phone = v_phone) then
    v_phone := null;
  end if;
  if v_email is not null and exists (select 1 from customers where email = v_email) then
    v_email := null;
  end if;

  insert into customers (first_name, last_name, email, phone, status, auth_user_id, created_by)
  values (v_first, v_last, v_email, v_phone, 'active', p_auth_user_id, null)
  returning id into v_customer_id;
  return v_customer_id;

exception
  when unique_violation then
    -- Racing signup for the same login: return the row that won.
    select id into v_customer_id
    from customers where auth_user_id = p_auth_user_id limit 1;
    if v_customer_id is not null then
      return v_customer_id;
    end if;
    raise;
end;
$$;

comment on function link_customer_account is
  'Create-or-link the CRM customer for a storefront login (signup + lazy heal). Reuses a guest row by phone, backfills only missing fields. SECURITY DEFINER; service_role only.';

-- ---- profile editor (overwrite own row) -----------------------------------
create or replace function update_customer_profile(
  p_auth_user_id uuid,
  p_first_name   text,
  p_last_name    text,
  p_phone        text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_first text := nullif(trim(coalesce(p_first_name, '')), '');
  v_last  text := nullif(trim(coalesce(p_last_name, '')), '');
begin
  select id into v_customer_id
  from customers where auth_user_id = p_auth_user_id limit 1;
  if v_customer_id is null then
    raise exception 'no linked customer' using errcode = 'P0002';
  end if;

  -- Phone is the CRM identity — refuse to steal it from another customer.
  if v_phone is not null and exists (
    select 1 from customers where phone = v_phone and id <> v_customer_id
  ) then
    raise exception 'phone in use' using errcode = 'P0003';
  end if;

  update customers set
    first_name = v_first,
    last_name  = v_last,
    phone      = v_phone,
    updated_at = now()
  where id = v_customer_id;
end;
$$;

comment on function update_customer_profile is
  'Update the caller''s own linked customer (name + phone). Phone-collision safe. SECURITY DEFINER; service_role only.';

-- ---- lock execution to the service role -----------------------------------
revoke all on function link_customer_account(uuid, text, text, text, text) from public;
revoke all on function link_customer_account(uuid, text, text, text, text) from anon, authenticated;
grant execute on function link_customer_account(uuid, text, text, text, text) to service_role;

revoke all on function update_customer_profile(uuid, text, text, text) from public;
revoke all on function update_customer_profile(uuid, text, text, text) from anon, authenticated;
grant execute on function update_customer_profile(uuid, text, text, text) to service_role;
