-- 20260816150000_lookup_guest_order_cargo_info
--
-- Guests tracking an order via /siparis-sorgula should see the same cargo
-- info logged-in customers see on /hesap. Re-create lookup_guest_order
-- (20260814120100) with the three cargo columns added to its return set —
-- still status-only, no address/items/name disclosed.
--
-- CREATE OR REPLACE cannot change a function's OUT-parameter row type
-- (Postgres 42P13) — adding the three cargo columns to RETURNS TABLE
-- requires dropping the old signature first.

drop function if exists lookup_guest_order(text, text);

create function lookup_guest_order(
  p_order_number text,
  p_phone        text
) returns table (
  order_id             uuid,
  order_number         text,
  status               public.order_status,
  payment_status       public.payment_status,
  payment_method       public.payment_method,
  total_minor          bigint,
  scheduled_for        date,
  fulfillment_channel  public.fulfillment_channel,
  created_at           timestamptz,
  cargo_carrier        text,
  cargo_tracking_number text,
  cargo_tracking_url   text
)
language sql
security definer
set search_path = public
stable
as $$
  select o.id, o.order_number, o.status, o.payment_status, o.payment_method,
         o.total_minor, o.scheduled_for, o.fulfillment_channel, o.created_at,
         o.cargo_carrier, o.cargo_tracking_number, o.cargo_tracking_url
  from orders o
  join customers c on c.id = o.customer_id
  where o.order_number = trim(p_order_number)
    and c.phone is not null
    and c.phone = trim(p_phone)
  limit 1;
$$;

comment on function lookup_guest_order is
  'Read one order by number + the phone recorded on it, for customers with no login. Returns status and cargo tracking fields only — never address, items or name — so a guessed order number discloses nothing useful. SECURITY DEFINER; service_role only.';

revoke all on function lookup_guest_order(text, text) from public;
revoke all on function lookup_guest_order(text, text) from anon, authenticated;
grant execute on function lookup_guest_order(text, text) to service_role;
