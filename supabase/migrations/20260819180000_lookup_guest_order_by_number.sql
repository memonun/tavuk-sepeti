-- 20260819180000_lookup_guest_order_by_number
--
-- /siparis-sorgula gets a second tab: "Sipariş numarası ile bul", for a guest
-- who has the order number handy but not the phone it was placed with (or
-- doesn't want to re-enter it). Deliberately asks for NOTHING else — no
-- phone, no order type — per an explicit product decision to trade away the
-- phone-based scanning defense that lookup_guest_order and
-- lookup_guest_orders_by_details both rely on (see their comments). Because
-- an order number alone is guessable/sequential, rate limiting here is the
-- only defense against enumeration, so it reuses the same
-- guest_order_lookup_attempts table the phone-based RPC already writes to —
-- widened to accept an order_number-keyed attempt instead of a phone-keyed
-- one.

alter table guest_order_lookup_attempts
  alter column phone drop not null;

alter table guest_order_lookup_attempts
  add column if not exists order_number text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'guest_order_lookup_attempts_one_key'
      and conrelid = 'public.guest_order_lookup_attempts'::regclass
  ) then
    alter table guest_order_lookup_attempts
    add constraint guest_order_lookup_attempts_one_key
    check ((phone is not null) <> (order_number is not null));
  end if;
end $$;

create index if not exists guest_order_lookup_attempts_order_number_idx
  on guest_order_lookup_attempts (order_number, attempted_at desc)
  where order_number is not null;

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

  -- Qualified with the table alias: `order_number` is bare-ambiguous here
  -- because RETURNS TABLE makes it double as a plpgsql variable name (the
  -- OUT parameter) in scope through this whole function body, and Postgres
  -- can't tell that apart from guest_order_lookup_attempts.order_number.
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
           o.cargo_carrier, o.cargo_tracking_number, o.cargo_tracking_url
    from orders o
    where o.order_number = v_number
    limit 1;
end;
$$;

comment on function lookup_guest_order_by_number is
  'Guest order lookup by order number ALONE — no phone, no order type. An explicit product '
  'decision traded away the phone-based scanning defense the other guest lookups rely on, so '
  'the per-number and per-IP rate limit (guest_order_lookup_attempts) is the only guard against '
  'enumerating sequential order numbers. Same status/cargo-only column set as lookup_guest_order '
  '— never address, items or name. SECURITY DEFINER; service_role only.';

revoke all on function lookup_guest_order_by_number(text, text) from public;
revoke all on function lookup_guest_order_by_number(text, text) from anon, authenticated;
grant execute on function lookup_guest_order_by_number(text, text) to service_role;
