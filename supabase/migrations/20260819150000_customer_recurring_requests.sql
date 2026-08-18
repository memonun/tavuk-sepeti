-- 20260819150000_customer_recurring_requests
--
-- WHY: /duzenli-siparis was a deliberately fake "coming soon" preview — no
-- customer backend existed. The owner wants customers to be able to REQUEST
-- a recurring subscription themselves; staff still approves before it goes
-- live (same as today's admin-typed-in flow), via the existing active
-- toggle in recurring-template-actions.ts.
--
-- Mirrors the customer-write pattern already established for addresses
-- (upsert_customer_address / delete_customer_address in
-- 20260805090100_customer_account_no_legacy_match.sql): customers have NO
-- direct INSERT/UPDATE/DELETE RLS policy on recurring_templates, only a
-- SECURITY DEFINER RPC that resolves customer_id from p_auth_user_id itself
-- and is locked to service_role via revoke/grant. Reads go through a plain
-- customer-scoped SELECT policy, same shape as addresses_self_select.

-- ---- Workflow columns -------------------------------------------------------
-- source distinguishes a customer-submitted request from a staff-typed
-- template — reuses the existing customer_origin enum
-- (20260805090000_customers_origin_and_scoped_uniques.sql) rather than
-- inventing a new one.
alter table recurring_templates
  add column source customer_origin not null default 'admin_manual';

-- approved_at is a SEPARATE signal from active: "source='customer_web' and
-- not active" alone can't tell a fresh request apart from a subscription
-- staff paused months ago (both look identical). The admin "Yeni talep"
-- badge keys off source='customer_web' and approved_at is null.
alter table recurring_templates
  add column approved_at timestamptz;

-- cancelled_at backs a SOFT cancel (see cancel_customer_recurring_template
-- below) — hard-deleting would sever orders.recurring_template_id (ON DELETE
-- SET NULL) and leave the customer's own list with no "İptal edildi" trail.
alter table recurring_templates
  add column cancelled_at timestamptz;

comment on column recurring_templates.source is
  'admin_manual = staff-created (default, matches all pre-existing rows). customer_web = customer self-service request via /duzenli-siparis, starts inactive pending staff approval.';
comment on column recurring_templates.approved_at is
  'Set the first time a customer_web request is switched active (see setRecurringTemplateActiveAction). Null = still pending review. Distinct from `active` so a later staff pause does not make the row look like a fresh request again.';
comment on column recurring_templates.cancelled_at is
  'Set by cancel_customer_recurring_template (customer-initiated soft cancel). The row stays for history; active is forced false alongside it.';

-- ---- Lock payment_method to unattended-safe methods -------------------------
-- No constraint existed before this — only Zod + the admin <select> kept
-- credit_card out. Card requires interactive 3D Secure, which an unattended
-- future charge can never provide, so enforce it in the DB now that a new
-- (client-adjacent) write path is being added.
alter table recurring_templates
  add constraint recurring_templates_payment_method_no_card
  check (payment_method in ('cash_on_delivery', 'bank_transfer'));

-- ---- Customer read access ----------------------------------------------------
-- Exact shape of addresses_self_select (20260726120200_customer_auth.sql).
create policy recurring_templates_customer_select on recurring_templates
  for select to authenticated
  using (
    customer_id in (select id from customers where auth_user_id = auth.uid())
  );

-- ---- Create: customer submits a request, always inactive --------------------
create or replace function create_customer_recurring_template(
  p_auth_user_id   uuid,
  p_cadence        recurring_cadence,
  p_day_of_week    smallint,
  p_items          jsonb,
  p_payment_method payment_method,
  p_next_run_at    timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id  uuid;
  v_has_primary  boolean;
  v_template_id  uuid;
  v_existing_cnt integer;
begin
  select id into v_customer_id
  from customers where auth_user_id = p_auth_user_id limit 1;
  if v_customer_id is null then
    raise exception 'no linked customer' using errcode = 'P0002';
  end if;

  select exists(
    select 1 from addresses where customer_id = v_customer_id and is_primary
  ) into v_has_primary;
  if not v_has_primary then
    raise exception 'customer has no primary address' using errcode = 'P0007';
  end if;

  if p_payment_method not in ('cash_on_delivery', 'bank_transfer') then
    raise exception 'payment method not allowed for recurring orders' using errcode = 'P0009';
  end if;

  if p_cadence not in ('weekly', 'biweekly') then
    raise exception 'cadence not allowed for a customer request' using errcode = 'P0009';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'recurring request needs at least one item' using errcode = 'P0001';
  end if;

  select count(*) into v_existing_cnt
  from recurring_templates
  where customer_id = v_customer_id and cancelled_at is null;
  if v_existing_cnt >= 3 then
    raise exception 'too many recurring templates for this customer' using errcode = 'P0008';
  end if;

  insert into recurring_templates (
    customer_id, cadence, day_of_week, day_of_month, items,
    payment_method, active, next_run_at, source, approved_at
  ) values (
    v_customer_id, p_cadence, p_day_of_week, null, p_items,
    p_payment_method, false, p_next_run_at, 'customer_web', null
  )
  returning id into v_template_id;

  return v_template_id;
end;
$$;

comment on function create_customer_recurring_template is
  'Customer self-service recurring order REQUEST. Always inserts active=false, source=customer_web, approved_at=null — staff approves via the existing admin toggle. SECURITY DEFINER; service_role only.';

-- ---- Cancel: customer withdraws their own template (any status) -------------
create or replace function cancel_customer_recurring_template(
  p_auth_user_id uuid,
  p_template_id  uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_owned_id    uuid;
begin
  select id into v_customer_id
  from customers where auth_user_id = p_auth_user_id limit 1;
  if v_customer_id is null then
    raise exception 'no linked customer' using errcode = 'P0002';
  end if;

  update recurring_templates
    set active = false, cancelled_at = now()
  where id = p_template_id and customer_id = v_customer_id
  returning id into v_owned_id;

  if v_owned_id is null then
    raise exception 'template does not belong to this account' using errcode = 'P0004';
  end if;

  -- A cancelled subscription should not leave an already-materialized future
  -- order sitting on the books. Only touches orders still pending (never
  -- confirmed/shipped/delivered) generated from this exact template.
  with cancelled_orders as (
    update orders
      set status = 'cancelled'
    where recurring_template_id = p_template_id and status = 'pending'
    returning id
  )
  insert into order_status_events (order_id, from_status, to_status, reason, actor_id)
  select id, 'pending', 'cancelled', 'Müşteri düzenli siparişi iptal etti.', p_auth_user_id
  from cancelled_orders;
end;
$$;

comment on function cancel_customer_recurring_template is
  'Customer self-service cancel. Soft-cancels the template (active=false, cancelled_at set — never hard-deleted, so orders.recurring_template_id history survives) and cancels any not-yet-fulfilled orders it already generated. SECURITY DEFINER; service_role only.';

-- ---- Lock execution to the service role -------------------------------------
revoke all on function create_customer_recurring_template(uuid, recurring_cadence, smallint, jsonb, payment_method, timestamptz) from public;
revoke all on function create_customer_recurring_template(uuid, recurring_cadence, smallint, jsonb, payment_method, timestamptz) from anon, authenticated;
grant execute on function create_customer_recurring_template(uuid, recurring_cadence, smallint, jsonb, payment_method, timestamptz) to service_role;

revoke all on function cancel_customer_recurring_template(uuid, uuid) from public;
revoke all on function cancel_customer_recurring_template(uuid, uuid) from anon, authenticated;
grant execute on function cancel_customer_recurring_template(uuid, uuid) to service_role;
