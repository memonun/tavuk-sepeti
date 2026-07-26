-- 20260726120200_customer_auth
-- Faz 2 — customer accounts for the storefront (email + password via Supabase
-- Auth). Customers now share the same auth.users space as admins, so this
-- migration does three things:
--
--   1. LOCK DOWN SIGNUP. The Faz-1 bootstrap trigger auto-promoted every new
--      auth.users row to app_users role='admin' (its own comment said "Faz 2
--      will lock signup down"). With customer self-signup live, that would make
--      every customer an admin. Drop it. New admins are now provisioned
--      explicitly (insert into app_users) — existing admins keep their rows.
--
--   2. LINK auth users to customers. `customers.auth_user_id` ties a storefront
--      login to its customer record. Nullable: admin-entered customers and
--      guests have none.
--
--   3. CUSTOMER-SCOPED RLS. Additive SELECT policies so a logged-in customer
--      sees ONLY their own customer / address / order rows. Admin policies are
--      untouched (OR-composed, so admins still see everything). Customers never
--      write to tables directly — order placement stays inside place_web_order.

-- ---- 1. Remove the auto-admin trigger -------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists bootstrap_app_user();

-- ---- 2. Link customers to their auth user ---------------------------------
alter table customers
  add column auth_user_id uuid references auth.users(id) on delete set null;

-- One customer per login.
create unique index customers_auth_user_id_unique
  on customers (auth_user_id)
  where auth_user_id is not null;

comment on column customers.auth_user_id is
  'Storefront login (auth.users) this customer record belongs to. Null for admin-entered / guest customers.';

-- ---- 3a. Let logged-in (non-admin) customers read the catalog -------------
-- The Faz-2 storefront read policies were `to anon` only; a logged-in customer
-- is `authenticated` and is NOT an admin, so without these they couldn't see
-- the catalog. Active products + tiers are public either way.
create policy products_authenticated_read_active on products
  for select to authenticated
  using (active);

create policy product_price_tiers_authenticated_read on product_price_tiers
  for select to authenticated
  using (true);

-- ---- 3b. Customer self-access (SELECT only) -------------------------------
create policy customers_self_select on customers
  for select to authenticated
  using (auth_user_id = auth.uid());

create policy addresses_self_select on addresses
  for select to authenticated
  using (
    customer_id in (select id from customers where auth_user_id = auth.uid())
  );

create policy orders_self_select on orders
  for select to authenticated
  using (
    customer_id in (select id from customers where auth_user_id = auth.uid())
  );

create policy order_items_self_select on order_items
  for select to authenticated
  using (
    order_id in (
      select o.id from orders o
      join customers c on c.id = o.customer_id
      where c.auth_user_id = auth.uid()
    )
  );

create policy order_status_events_self_select on order_status_events
  for select to authenticated
  using (
    order_id in (
      select o.id from orders o
      join customers c on c.id = o.customer_id
      where c.auth_user_id = auth.uid()
    )
  );

-- ---- 4. Extend place_web_order to attach an order to a logged-in account ---
-- Adds p_auth_user_id (nullable). When present we reuse the customer already
-- linked to that login; otherwise we upsert by phone (guest path) and claim the
-- row for the login if it isn't linked yet — so a guest who later signs up with
-- the same phone gets their history unified. Drop+recreate because the argument
-- list changes.
drop function if exists place_web_order(
  text, text, text, text, jsonb, date, time_slot, payment_method, text, bigint, jsonb
);

create or replace function place_web_order(
  p_first_name          text,
  p_last_name           text,
  p_phone               text,
  p_email               text,
  p_address             jsonb,
  p_scheduled_for       date,
  p_time_slot           time_slot,
  p_payment_method      payment_method,
  p_delivery_notes      text,
  p_delivery_fee_minor  bigint,
  p_items               jsonb,
  p_auth_user_id        uuid default null
) returns table (order_id uuid, order_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id    uuid;
  v_order_number text;
  v_subtotal    bigint := 0;
  v_item_count  int;
  v_email       text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_has_coords  boolean;
  v_lat         double precision;
  v_lng         double precision;
  v_snapshot    jsonb;
begin
  select count(*) into v_item_count from jsonb_array_elements(p_items);
  if v_item_count = 0 then
    raise exception 'order needs at least one item' using errcode = 'P0001';
  end if;

  -- Prefer the customer already linked to this login.
  if p_auth_user_id is not null then
    select id into v_customer_id
    from customers where auth_user_id = p_auth_user_id limit 1;
  end if;

  if v_customer_id is null then
    if v_email is not null and exists (select 1 from customers where email = v_email) then
      v_email := null;
    end if;

    insert into customers (first_name, last_name, email, phone, status, created_by)
    values (
      nullif(trim(p_first_name), ''),
      nullif(trim(p_last_name), ''),
      v_email,
      p_phone,
      'active',
      null
    )
    on conflict (phone) do update set updated_at = now()
    returning id into v_customer_id;

    -- Claim this (possibly pre-existing guest) customer for the login.
    if p_auth_user_id is not null then
      update customers
      set auth_user_id = p_auth_user_id
      where id = v_customer_id and auth_user_id is null;
    end if;
  end if;

  -- Address (primary row only when we have a pin and none exists yet).
  v_has_coords := (p_address ? 'lat') and (p_address ? 'lng')
                  and (p_address->>'lat') is not null and (p_address->>'lng') is not null;

  if v_has_coords then
    v_lat := (p_address->>'lat')::double precision;
    v_lng := (p_address->>'lng')::double precision;

    if not exists (
      select 1 from addresses where customer_id = v_customer_id and is_primary
    ) then
      insert into addresses (
        customer_id, raw_text, description, lat, lng, source, accuracy, geocoded_at,
        city, district, neighborhood, street, building_no, apartment_no, postal_code,
        is_primary, address_source
      ) values (
        v_customer_id,
        left(coalesce(nullif(trim(p_address->>'raw_text'), ''), v_lat::text || ', ' || v_lng::text), 500),
        nullif(trim(p_address->>'description'), ''),
        v_lat, v_lng,
        coalesce((p_address->>'source')::coordinate_source, 'geocoded_auto'),
        coalesce((p_address->>'accuracy')::coordinate_accuracy, 'unknown'),
        now(),
        nullif(trim(p_address->>'city'), ''),
        nullif(trim(p_address->>'district'), ''),
        nullif(trim(p_address->>'neighborhood'), ''),
        nullif(trim(p_address->>'street'), ''),
        nullif(trim(p_address->>'building_no'), ''),
        nullif(trim(p_address->>'apartment_no'), ''),
        nullif(trim(p_address->>'postal_code'), ''),
        true,
        'customer_signup'
      );
    end if;
  end if;

  v_snapshot := jsonb_build_object(
    'raw_text',     coalesce(nullif(trim(p_address->>'raw_text'), ''), ''),
    'description',  p_address->>'description',
    'lat',          case when v_has_coords then v_lat else null end,
    'lng',          case when v_has_coords then v_lng else null end,
    'accuracy',     coalesce(p_address->>'accuracy', 'unknown'),
    'source',       coalesce(p_address->>'source', 'user_pin'),
    'city',         p_address->>'city',
    'district',     p_address->>'district',
    'neighborhood', p_address->>'neighborhood',
    'street',       p_address->>'street',
    'building_no',  p_address->>'building_no',
    'apartment_no', p_address->>'apartment_no',
    'postal_code',  p_address->>'postal_code'
  );

  select coalesce(sum(coalesce(x.line_total_minor, (x.quantity * x.unit_price_minor)::bigint)), 0)
    into v_subtotal
  from jsonb_to_recordset(p_items) as x(
    quantity numeric, unit_price_minor bigint, line_total_minor bigint
  );

  insert into orders (
    customer_id, scheduled_for, time_slot, payment_method, delivery_notes,
    subtotal_minor, delivery_fee_minor, delivery_address_snapshot, created_by, source
  ) values (
    v_customer_id, p_scheduled_for, p_time_slot, p_payment_method, p_delivery_notes,
    v_subtotal, coalesce(p_delivery_fee_minor, 0), v_snapshot, null, 'customer_web'
  )
  returning id, order_number into v_order_id, v_order_number;

  insert into order_items (
    order_id, product_key, quantity, unit_price_minor, line_total_minor, product_snapshot
  )
  select
    v_order_id, x.product_key, x.quantity, x.unit_price_minor,
    coalesce(x.line_total_minor, (x.quantity * x.unit_price_minor)::bigint),
    x.product_snapshot
  from jsonb_to_recordset(p_items) as x(
    product_key text, quantity numeric, unit_price_minor bigint,
    line_total_minor bigint, product_snapshot jsonb
  );

  insert into order_status_events (order_id, from_status, to_status, actor_id)
  values (v_order_id, null, 'pending', null);

  return query select v_order_id, v_order_number;
end;
$$;

comment on function place_web_order is
  'Guest/customer storefront checkout. Atomic: reuse-by-login or find-or-create customer by phone (claims a guest row for the login), optional primary address, order (source=customer_web, created_by=null) + items + initial pending event. SECURITY DEFINER; service_role only.';

revoke all on function place_web_order(
  text, text, text, text, jsonb, date, time_slot, payment_method, text, bigint, jsonb, uuid
) from public;
revoke all on function place_web_order(
  text, text, text, text, jsonb, date, time_slot, payment_method, text, bigint, jsonb, uuid
) from anon, authenticated;
grant execute on function place_web_order(
  text, text, text, text, jsonb, date, time_slot, payment_method, text, bigint, jsonb, uuid
) to service_role;
