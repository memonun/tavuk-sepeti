-- 20260819170000_lookup_guest_orders_by_phone_and_type
--
-- lookup_guest_orders_by_details (20260819160000) asked for phone + order
-- date + order type. In practice guests rarely remember the exact placement
-- date, so the date filter is dropped: a guest now identifies their orders
-- by phone + order type alone, and every matching order comes back for them
-- to pick from (find-order-form.tsx already renders a picker for >1 match).
--
-- Dropping the date narrows the filter further versus the already-narrowed
-- phone+date+type design, so the result cap goes up (10 -> 30, newest
-- first) to comfortably fit a repeat customer's history while still
-- bounding the picker UI. The existing per-phone/per-IP rate limit
-- (guest_order_lookup_attempts) is untouched — it was never keyed on date.

drop function if exists lookup_guest_orders_by_details(text, date, text, text);

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
  scheduled_for         date,
  fulfillment_channel   public.fulfillment_channel,
  created_at            timestamptz,
  cargo_carrier         text,
  cargo_tracking_number text,
  cargo_tracking_url    text
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
           o.cargo_carrier, o.cargo_tracking_number, o.cargo_tracking_url
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
  'and per IP inside the same call (see guest_order_lookup_attempts). Returns the same '
  'status/cargo-only column set as lookup_guest_order — never address, items or name. '
  'SECURITY DEFINER; service_role only.';

revoke all on function lookup_guest_orders_by_details(text, text, text) from public;
revoke all on function lookup_guest_orders_by_details(text, text, text) from anon, authenticated;
grant execute on function lookup_guest_orders_by_details(text, text, text) to service_role;
