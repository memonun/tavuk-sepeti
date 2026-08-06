-- 20260805090100_customer_account_no_legacy_match
--
-- WHY: complete the "web accounts are written from scratch" rule started in the
-- previous migration by removing every code path that reaches for an existing
-- customer row. Also give storefront accounts a way to manage their own delivery
-- addresses without granting the browser any table write (customers still have
-- SELECT-only RLS; all writes go through service_role SECURITY DEFINER RPCs).
--
-- Three changes:
--   1. link_customer_account   — never claims a row by phone; never nulls a
--                                colliding phone/email; always stamps
--                                origin='customer_web'.
--   2. update_customer_profile — phone-collision check scoped to the web space,
--                                so a legacy row's phone can't block a customer.
--   3. upsert/delete_customer_address — the account's address book.

-- ---- addresses: label + geo verification stamp ------------------------------
-- label lets an account name its addresses ("Ev", "İş") now that an order binds
-- to a specific address rather than "whatever is primary".
alter table addresses
  add column label text
    check (label is null or length(trim(label)) between 1 and 60),
  add column geo_verified_at timestamptz;

comment on column addresses.label is
  'Customer-facing nickname for this address ("Ev", "İş"). Null for admin-entered rows.';
comment on column addresses.geo_verified_at is
  'When the pin was last checked against service_areas. Null = never verified (legacy/admin rows).';

-- ---- 1. link_customer_account: create-only, never match ---------------------
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

  -- (1) Already linked → backfill ONLY missing fields, then return. The guard in
  -- the WHERE clause keeps steady-state account loads write-free.
  select id into v_customer_id
  from customers where auth_user_id = p_auth_user_id limit 1;

  if v_customer_id is not null then
    update customers set
      first_name = coalesce(first_name, v_first),
      last_name  = coalesce(last_name, v_last),
      phone      = coalesce(phone, v_phone),
      email      = coalesce(email, v_email),
      updated_at = now()
    where id = v_customer_id
      and (
        (first_name is null and v_first is not null) or
        (last_name  is null and v_last  is not null) or
        (phone      is null and v_phone is not null) or
        (email      is null and v_email is not null)
      );
    return v_customer_id;
  end if;

  -- (2) Create a fresh customer for this login. NO phone lookup, NO email
  -- lookup, NO merge — a legacy row holding the same phone is left untouched and
  -- the scoped unique indexes let both rows coexist. This is the whole point of
  -- the owner's "db'de hiç yokmuş gibi sıfırdan yazılsın" decision.
  insert into customers (
    first_name, last_name, email, phone, status, auth_user_id, created_by, origin
  )
  values (v_first, v_last, v_email, v_phone, 'active', p_auth_user_id, null, 'customer_web')
  returning id into v_customer_id;

  return v_customer_id;

exception
  when unique_violation then
    -- Either a racing signup for the same login (return the row that won), or a
    -- phone/email already taken by ANOTHER WEB account. The second case is a real
    -- user-facing condition, so it gets its own code instead of being papered
    -- over by nulling the field.
    select id into v_customer_id
    from customers where auth_user_id = p_auth_user_id limit 1;
    if v_customer_id is not null then
      return v_customer_id;
    end if;
    raise exception 'phone or email already registered to another account'
      using errcode = 'P0005';
end;
$$;

comment on function link_customer_account is
  'Create-or-return the CRM customer for a storefront login. NEVER matches an existing row by phone/email — web accounts are written from scratch (origin=customer_web) and legacy rows are never touched. Raises P0005 when the phone/email belongs to another web account. SECURITY DEFINER; service_role only.';

-- ---- 2. update_customer_profile: collision check scoped to the web space ----
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

  -- Only another WEB account can hold this phone against us; a legacy row with
  -- the same number is a different person's record and must not block anything.
  if v_phone is not null and exists (
    select 1 from customers
    where phone = v_phone and origin = 'customer_web' and id <> v_customer_id
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

-- ---- 3. Address book for storefront accounts --------------------------------
-- Customers have SELECT-only RLS on `addresses`; these SECURITY DEFINER writers
-- are the only way an account touches its own address rows.

create or replace function upsert_customer_address(
  p_auth_user_id uuid,
  p_address_id   uuid,      -- null = create, otherwise update in place
  p_address      jsonb,
  p_make_primary boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_address_id  uuid;
  v_lat double precision := (p_address->>'lat')::double precision;
  v_lng double precision := (p_address->>'lng')::double precision;
  v_raw text := left(coalesce(nullif(trim(p_address->>'raw_text'), ''),
                              v_lat::text || ', ' || v_lng::text), 500);
begin
  select id into v_customer_id
  from customers where auth_user_id = p_auth_user_id limit 1;
  if v_customer_id is null then
    raise exception 'no linked customer' using errcode = 'P0002';
  end if;

  if v_lat is null or v_lng is null then
    raise exception 'address needs a confirmed pin' using errcode = 'P0006';
  end if;

  -- Clear the previous primary FIRST: addresses_one_primary_per_customer is a
  -- non-deferred partial unique index, so both rows may not be primary at once
  -- even inside a transaction.
  if coalesce(p_make_primary, false) then
    update addresses set is_primary = false, updated_at = now()
    where customer_id = v_customer_id
      and is_primary
      and (p_address_id is null or id <> p_address_id);
  end if;

  if p_address_id is not null then
    update addresses set
      label         = nullif(trim(p_address->>'label'), ''),
      raw_text      = v_raw,
      description   = nullif(trim(p_address->>'description'), ''),
      lat           = v_lat,
      lng           = v_lng,
      source        = coalesce((p_address->>'source')::coordinate_source, 'user_pin'),
      accuracy      = coalesce((p_address->>'accuracy')::coordinate_accuracy, 'unknown'),
      city          = nullif(trim(p_address->>'city'), ''),
      district      = nullif(trim(p_address->>'district'), ''),
      neighborhood  = nullif(trim(p_address->>'neighborhood'), ''),
      street        = nullif(trim(p_address->>'street'), ''),
      building_no   = nullif(trim(p_address->>'building_no'), ''),
      apartment_no  = nullif(trim(p_address->>'apartment_no'), ''),
      postal_code   = nullif(trim(p_address->>'postal_code'), ''),
      is_primary    = coalesce(p_make_primary, is_primary),
      geo_verified_at = case when (p_address->>'geo_verified')::boolean
                             then now() else geo_verified_at end,
      updated_at    = now()
    where id = p_address_id and customer_id = v_customer_id
    returning id into v_address_id;

    if v_address_id is null then
      raise exception 'address does not belong to this account' using errcode = 'P0004';
    end if;
    return v_address_id;
  end if;

  insert into addresses (
    customer_id, label, raw_text, description, lat, lng, source, accuracy,
    geocoded_at, geo_verified_at, city, district, neighborhood, street,
    building_no, apartment_no, postal_code, is_primary, address_source
  ) values (
    v_customer_id,
    nullif(trim(p_address->>'label'), ''),
    v_raw,
    nullif(trim(p_address->>'description'), ''),
    v_lat, v_lng,
    coalesce((p_address->>'source')::coordinate_source, 'user_pin'),
    coalesce((p_address->>'accuracy')::coordinate_accuracy, 'unknown'),
    now(),
    case when (p_address->>'geo_verified')::boolean then now() else null end,
    nullif(trim(p_address->>'city'), ''),
    nullif(trim(p_address->>'district'), ''),
    nullif(trim(p_address->>'neighborhood'), ''),
    nullif(trim(p_address->>'street'), ''),
    nullif(trim(p_address->>'building_no'), ''),
    nullif(trim(p_address->>'apartment_no'), ''),
    nullif(trim(p_address->>'postal_code'), ''),
    -- First address is always primary, regardless of what the caller asked for.
    coalesce(p_make_primary, false)
      or not exists (select 1 from addresses where customer_id = v_customer_id and is_primary),
    'customer_signup'
  )
  returning id into v_address_id;

  return v_address_id;
end;
$$;

comment on function upsert_customer_address is
  'Create or update one of the caller''s own addresses. Ownership-checked (P0004), pin required (P0006). SECURITY DEFINER; service_role only.';

create or replace function delete_customer_address(
  p_auth_user_id uuid,
  p_address_id   uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_was_primary boolean;
begin
  select id into v_customer_id
  from customers where auth_user_id = p_auth_user_id limit 1;
  if v_customer_id is null then
    raise exception 'no linked customer' using errcode = 'P0002';
  end if;

  delete from addresses
  where id = p_address_id and customer_id = v_customer_id
  returning is_primary into v_was_primary;

  if v_was_primary is null then
    raise exception 'address does not belong to this account' using errcode = 'P0004';
  end if;

  -- Promote another address so the account never ends up with zero primaries.
  if v_was_primary then
    update addresses set is_primary = true, updated_at = now()
    where id = (
      select id from addresses where customer_id = v_customer_id
      order by created_at desc limit 1
    );
  end if;
end;
$$;

comment on function delete_customer_address is
  'Delete one of the caller''s own addresses and promote a replacement primary. Blocked by orders.address_id ON DELETE RESTRICT when the address carries order history. SECURITY DEFINER; service_role only.';

-- ---- Lock execution to the service role -------------------------------------
revoke all on function upsert_customer_address(uuid, uuid, jsonb, boolean) from public;
revoke all on function upsert_customer_address(uuid, uuid, jsonb, boolean) from anon, authenticated;
grant execute on function upsert_customer_address(uuid, uuid, jsonb, boolean) to service_role;

revoke all on function delete_customer_address(uuid, uuid) from public;
revoke all on function delete_customer_address(uuid, uuid) from anon, authenticated;
grant execute on function delete_customer_address(uuid, uuid) to service_role;
