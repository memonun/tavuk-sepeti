-- 20260819220100_guest_lookup_estimated_delivery
--
-- Surfaces orders.estimated_delivery_at (20260819220000) through the two
-- live guest order-lookup RPCs, so /siparis-sorgula can show a delivery
-- customer their estimated arrival time. Both RPCs declare an explicit
-- `returns table (...)` and an explicit `select` column list (not
-- `select o.*`), so the new column would not otherwise flow through — same
-- reasoning as every other column already on this list (never expose more
-- than the guest needs: no address, no items, no name).
--
-- Only the INPUT signatures are unchanged (no new required parameter), so
-- this doesn't hit CLAUDE.md §7's deploy-ordering hazard (that was about a
-- newly-REQUIRED input breaking already-deployed callers using the old
-- signature) — an added output column is backward compatible for any caller
-- passing the same inputs, and the drop+create pair runs inside one
-- transaction, so no concurrent session ever sees the function "missing".

drop function if exists lookup_guest_orders_by_details(text, text, text);

create function lookup_guest_orders_by_details(
  p_phone      text,
  p_order_type text,       -- 'delivery' | 'shipping' | 'recurring'
  p_ip         text default null
) returns table (
  order_id                 uuid,
  order_number             text,
  status                   public.order_status,
  payment_status           public.payment_status,
  payment_method           public.payment_method,
  total_minor              bigint,
  scheduled_for            date,
  fulfillment_channel      public.fulfillment_channel,
  created_at               timestamptz,
  cargo_carrier            text,
  cargo_tracking_number    text,
  cargo_tracking_url       text,
  estimated_delivery_at    timestamptz
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
           o.total_minor, o.scheduled_for, o.fulfillment_channel, o.created_at,
           o.cargo_carrier, o.cargo_tracking_number, o.cargo_tracking_url,
           o.estimated_delivery_at
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
  'and per IP inside the same call (see guest_order_lookup_attempts). Returns status/cargo/ETA '
  'columns only — never address, items or name. SECURITY DEFINER; service_role only.';

revoke all on function lookup_guest_orders_by_details(text, text, text) from public;
revoke all on function lookup_guest_orders_by_details(text, text, text) from anon, authenticated;
grant execute on function lookup_guest_orders_by_details(text, text, text) to service_role;

drop function if exists lookup_guest_order_by_number(text, text);

create function lookup_guest_order_by_number(
  p_order_number text,
  p_ip           text default null
) returns table (
  order_id                 uuid,
  order_number             text,
  status                   public.order_status,
  payment_status           public.payment_status,
  payment_method           public.payment_method,
  total_minor              bigint,
  scheduled_for            date,
  fulfillment_channel      public.fulfillment_channel,
  created_at               timestamptz,
  cargo_carrier            text,
  cargo_tracking_number    text,
  cargo_tracking_url       text,
  estimated_delivery_at    timestamptz
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
           o.total_minor, o.scheduled_for, o.fulfillment_channel, o.created_at,
           o.cargo_carrier, o.cargo_tracking_number, o.cargo_tracking_url,
           o.estimated_delivery_at
    from orders o
    where o.order_number = v_number
    limit 1;
end;
$$;

comment on function lookup_guest_order_by_number is
  'Guest order lookup by order number ALONE — no phone, no order type. An explicit product '
  'decision traded away the phone-based scanning defense the other guest lookups rely on, so '
  'the per-number and per-IP rate limit (guest_order_lookup_attempts) is the only guard against '
  'enumerating sequential order numbers. Returns status/cargo/ETA columns only — never address, '
  'items or name. SECURITY DEFINER; service_role only.';

revoke all on function lookup_guest_order_by_number(text, text) from public;
revoke all on function lookup_guest_order_by_number(text, text) from anon, authenticated;
grant execute on function lookup_guest_order_by_number(text, text) to service_role;
