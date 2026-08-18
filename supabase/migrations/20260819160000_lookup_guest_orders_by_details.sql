-- 20260819160000_lookup_guest_orders_by_details
--
-- /siparis-sorgula no longer asks a guest for their order_number — it's a
-- dead end for anyone who lost the confirmation e-mail. Instead the guest
-- gives phone + order date (placement day) + order type (Malatya-içi
-- teslimat / kargo / düzenli sipariş), and this RPC resolves the matching
-- order(s) itself. Dropping order_number as the second factor shrinks the
-- search space versus lookup_guest_order (20260816150000), so lookups are
-- now rate-limited per phone and per IP inside the same call.

-- ---- Rate-limit log ----------------------------------------------------
create table guest_order_lookup_attempts (
  id uuid primary key default uuid_generate_v4(),
  phone text not null,
  ip text,
  attempted_at timestamptz not null default now()
);

create index guest_order_lookup_attempts_phone_idx
  on guest_order_lookup_attempts (phone, attempted_at desc);
create index guest_order_lookup_attempts_ip_idx
  on guest_order_lookup_attempts (ip, attempted_at desc)
  where ip is not null;

comment on table guest_order_lookup_attempts is
  'One row per /siparis-sorgula lookup attempt, written inside lookup_guest_orders_by_details '
  '(SECURITY DEFINER) so the rate-limit check and the write are one atomic round trip. Logged '
  'whether or not it matches an order, so the count itself is never an existence oracle.';

alter table guest_order_lookup_attempts enable row level security;
-- Deliberately no policies: only ever written/read from inside the
-- SECURITY DEFINER function below, never through PostgREST.

-- ---- Lookup RPC ----------------------------------------------------------
create function lookup_guest_orders_by_details(
  p_phone      text,
  p_order_date date,
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
     or p_order_date is null
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
      and (o.created_at at time zone 'Europe/Istanbul')::date = p_order_date
      and case p_order_type
            when 'recurring' then o.source = 'recurring_generated'
            when 'delivery'  then o.source <> 'recurring_generated' and o.fulfillment_channel = 'delivery'
            when 'shipping'  then o.source <> 'recurring_generated' and o.fulfillment_channel = 'shipping'
          end
    order by o.created_at desc
    limit 10;
end;
$$;

comment on function lookup_guest_orders_by_details is
  'Guest order lookup by phone + placement date (Europe/Istanbul calendar day) + order type, '
  'replacing order_number as the second factor. Rate-limited per phone and per IP inside the '
  'same call (see guest_order_lookup_attempts). Returns the same status/cargo-only column set '
  'as lookup_guest_order — never address, items or name. SECURITY DEFINER; service_role only.';

revoke all on function lookup_guest_orders_by_details(text, date, text, text) from public;
revoke all on function lookup_guest_orders_by_details(text, date, text, text) from anon, authenticated;
grant execute on function lookup_guest_orders_by_details(text, date, text, text) to service_role;
