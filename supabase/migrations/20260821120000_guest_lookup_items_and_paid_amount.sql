-- 20260821120000_guest_lookup_items_and_paid_amount
--
-- Owner decision (2026-08-21): the /siparis-sorgula guest lookups previously
-- returned status/cargo/ETA fields only — no line items, deliberately, per
-- the comments on lookup_guest_order (20260814120100, 20260816150000),
-- lookup_guest_orders_by_details and lookup_guest_order_by_number
-- (20260819160000/170000/180000/220100): "never expose more than the guest
-- needs: no address, no items, no name". The owner explicitly asked to
-- reverse that for items (what was bought) and amount_paid_minor (how much
-- has been paid so far), so a guest's lookup reads like the admin's own
-- order view minus the address — still no address, still no customer name,
-- still no e-mail, and the rate limits below are untouched.
--
-- Line items come back as a jsonb array built from order_items'
-- product_snapshot (frozen display_name/unit_label at order time — no join
-- back to products, so a later product rename/deletion can't break this).
--
-- Only OUTPUT columns are added; no input signature changes, so this is the
-- same backward-compatible case 20260819220100 already reasoned through: an
-- old, not-yet-redeployed caller passing the same inputs still works, and the
-- drop+create pair runs inside one transaction so no concurrent session ever
-- sees the function "missing".

drop function if exists lookup_guest_order(text, text);

create function lookup_guest_order(
  p_order_number text,
  p_phone        text
) returns table (
  order_id              uuid,
  order_number          text,
  status                public.order_status,
  payment_status        public.payment_status,
  payment_method        public.payment_method,
  total_minor           bigint,
  amount_paid_minor     bigint,
  scheduled_for         date,
  fulfillment_channel   public.fulfillment_channel,
  created_at            timestamptz,
  cargo_carrier         text,
  cargo_tracking_number text,
  cargo_tracking_url    text,
  items                 jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select o.id, o.order_number, o.status, o.payment_status, o.payment_method,
         o.total_minor, o.amount_paid_minor, o.scheduled_for, o.fulfillment_channel,
         o.created_at, o.cargo_carrier, o.cargo_tracking_number, o.cargo_tracking_url,
         coalesce(
           (select jsonb_agg(jsonb_build_object(
              'display_name', oi.product_snapshot ->> 'display_name',
              'unit_label', oi.product_snapshot ->> 'unit_label',
              'quantity', oi.quantity,
              'unit_price_minor', oi.unit_price_minor,
              'line_total_minor', oi.line_total_minor
            ) order by oi.created_at)
            from order_items oi
            where oi.order_id = o.id),
           '[]'::jsonb
         ) as items
  from orders o
  join customers c on c.id = o.customer_id
  where o.order_number = trim(p_order_number)
    and c.phone is not null
    and c.phone = trim(p_phone)
  limit 1;
$$;

comment on function lookup_guest_order is
  'Read one order by number + the phone recorded on it, for customers with no login. Returns status, cargo tracking, line items and amount paid — still never address, name or e-mail. SECURITY DEFINER; service_role only.';

revoke all on function lookup_guest_order(text, text) from public;
revoke all on function lookup_guest_order(text, text) from anon, authenticated;
grant execute on function lookup_guest_order(text, text) to service_role;

drop function if exists lookup_guest_orders_by_details(text, text, text);

create function lookup_guest_orders_by_details(
  p_phone      text,
  p_order_type text,       -- 'delivery' | 'shipping' | 'recurring'
  p_ip         text default null
) returns table (
  order_id              uuid,
  order_number          text,
  status                public.order_status,
  payment_status        public.payment_status,
  payment_method        public.payment_method,
  total_minor           bigint,
  amount_paid_minor     bigint,
  scheduled_for         date,
  fulfillment_channel   public.fulfillment_channel,
  created_at            timestamptz,
  cargo_carrier         text,
  cargo_tracking_number text,
  cargo_tracking_url    text,
  estimated_delivery_at timestamptz,
  items                 jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone_limit constant int := 8;
  v_ip_limit    constant int := 20;
  v_window      constant interval := interval '15 minutes';
  v_phone_count int;
  v_ip_count    int;
begin
  if p_phone is null or trim(p_phone) = ''
     or p_order_type not in ('delivery', 'shipping', 'recurring') then
    return;
  end if;

  insert into guest_order_lookup_attempts (phone, ip)
  values (trim(p_phone), nullif(trim(coalesce(p_ip, '')), ''));

  select count(*) into v_phone_count
    from guest_order_lookup_attempts
    where phone = trim(p_phone) and attempted_at > now() - v_window;

  if p_ip is not null and trim(p_ip) <> '' then
    select count(*) into v_ip_count
      from guest_order_lookup_attempts
      where ip = trim(p_ip) and attempted_at > now() - v_window;
  else
    v_ip_count := 0;
  end if;

  if v_phone_count > v_phone_limit or v_ip_count > v_ip_limit then
    raise exception 'too many lookup attempts' using errcode = 'P0002';
  end if;

  return query
    select o.id, o.order_number, o.status, o.payment_status, o.payment_method,
           o.total_minor, o.amount_paid_minor, o.scheduled_for, o.fulfillment_channel,
           o.created_at, o.cargo_carrier, o.cargo_tracking_number, o.cargo_tracking_url,
           o.estimated_delivery_at,
           coalesce(
             (select jsonb_agg(jsonb_build_object(
                'display_name', oi.product_snapshot ->> 'display_name',
                'unit_label', oi.product_snapshot ->> 'unit_label',
                'quantity', oi.quantity,
                'unit_price_minor', oi.unit_price_minor,
                'line_total_minor', oi.line_total_minor
              ) order by oi.created_at)
              from order_items oi
              where oi.order_id = o.id),
             '[]'::jsonb
           ) as items
    from orders o
    join customers c on c.id = o.customer_id
    where c.phone = trim(p_phone)
      and case p_order_type
            when 'recurring' then o.source = 'recurring_generated'
            when 'delivery'  then o.source <> 'recurring_generated' and o.fulfillment_channel = 'delivery'
            when 'shipping'  then o.source <> 'recurring_generated' and o.fulfillment_channel = 'shipping'
          end
    order by o.created_at desc
    limit 30;
end;
$$;

comment on function lookup_guest_orders_by_details is
  'Guest order lookup by phone + order type — every matching order comes back (newest first, '
  'capped at 30) for the guest to pick from, no placement date required. Rate-limited per phone '
  'and per IP inside the same call (see guest_order_lookup_attempts). Returns status/cargo/ETA, '
  'line items and amount paid — still never address, name or e-mail. SECURITY DEFINER; service_role only.';

revoke all on function lookup_guest_orders_by_details(text, text, text) from public;
revoke all on function lookup_guest_orders_by_details(text, text, text) from anon, authenticated;
grant execute on function lookup_guest_orders_by_details(text, text, text) to service_role;

drop function if exists lookup_guest_order_by_number(text, text);

create function lookup_guest_order_by_number(
  p_order_number text,
  p_ip           text default null
) returns table (
  order_id              uuid,
  order_number          text,
  status                public.order_status,
  payment_status        public.payment_status,
  payment_method        public.payment_method,
  total_minor           bigint,
  amount_paid_minor     bigint,
  scheduled_for         date,
  fulfillment_channel   public.fulfillment_channel,
  created_at            timestamptz,
  cargo_carrier         text,
  cargo_tracking_number text,
  cargo_tracking_url    text,
  estimated_delivery_at timestamptz,
  items                 jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number_limit constant int := 8;
  v_ip_limit     constant int := 20;
  v_window       constant interval := interval '15 minutes';
  v_number_count int;
  v_ip_count     int;
  v_number       text := trim(coalesce(p_order_number, ''));
begin
  if v_number = '' then
    return;
  end if;

  insert into guest_order_lookup_attempts (order_number, ip)
  values (v_number, nullif(trim(coalesce(p_ip, '')), ''));

  select count(*) into v_number_count
    from guest_order_lookup_attempts a
    where a.order_number = v_number and a.attempted_at > now() - v_window;

  if p_ip is not null and trim(p_ip) <> '' then
    select count(*) into v_ip_count
      from guest_order_lookup_attempts a
      where a.ip = trim(p_ip) and a.attempted_at > now() - v_window;
  else
    v_ip_count := 0;
  end if;

  if v_number_count > v_number_limit or v_ip_count > v_ip_limit then
    raise exception 'too many lookup attempts' using errcode = 'P0002';
  end if;

  return query
    select o.id, o.order_number, o.status, o.payment_status, o.payment_method,
           o.total_minor, o.amount_paid_minor, o.scheduled_for, o.fulfillment_channel,
           o.created_at, o.cargo_carrier, o.cargo_tracking_number, o.cargo_tracking_url,
           o.estimated_delivery_at,
           coalesce(
             (select jsonb_agg(jsonb_build_object(
                'display_name', oi.product_snapshot ->> 'display_name',
                'unit_label', oi.product_snapshot ->> 'unit_label',
                'quantity', oi.quantity,
                'unit_price_minor', oi.unit_price_minor,
                'line_total_minor', oi.line_total_minor
              ) order by oi.created_at)
              from order_items oi
              where oi.order_id = o.id),
             '[]'::jsonb
           ) as items
    from orders o
    where o.order_number = v_number
    limit 1;
end;
$$;

comment on function lookup_guest_order_by_number is
  'Guest order lookup by order number ALONE — no phone, no order type. An explicit product '
  'decision traded away the phone-based scanning defense the other guest lookups rely on, so '
  'the per-number and per-IP rate limit (guest_order_lookup_attempts) is the only guard against '
  'enumerating sequential order numbers. Owner decision 2026-08-21: returns line items and amount '
  'paid too now, alongside status/cargo/ETA — still never address, name or e-mail. SECURITY '
  'DEFINER; service_role only.';

revoke all on function lookup_guest_order_by_number(text, text) from public;
revoke all on function lookup_guest_order_by_number(text, text) from anon, authenticated;
grant execute on function lookup_guest_order_by_number(text, text) to service_role;
