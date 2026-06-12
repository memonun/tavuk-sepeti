-- 20260612120100_order_payments
--
-- Per-order payment ledger: deposits/advances, partial payments, and late
-- payments. Each row is one collected amount (negative = refund) with its own
-- date + channel, so "advance" vs "late" is derived from paid_at vs the
-- delivery date. The order's amount_paid_minor + payment_status are kept in
-- sync by triggers so they can never desync (the line_total lesson).

create type payment_channel as enum ('cash', 'bank_transfer', 'card');

create table order_payments (
  id           uuid primary key default uuid_generate_v4(),
  order_id     uuid not null references orders(id) on delete cascade,
  amount_minor bigint not null check (amount_minor <> 0), -- + received, − refund
  channel      payment_channel not null,
  paid_at      timestamptz not null default now(),
  note         text check (note is null or length(note) <= 500),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index order_payments_order_idx on order_payments (order_id);

alter table order_payments enable row level security;
create policy order_payments_admin_all on order_payments
  for all to authenticated using (is_admin()) with check (is_admin());

-- Derived, stored on the order so the grid/list read paid + balance cheaply.
alter table orders add column amount_paid_minor bigint not null default 0;

-- ---- recompute: single source of truth for paid amount + derived status ----
create or replace function recompute_order_payment(p_order_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_paid bigint;
  v_total bigint;
  v_status payment_status;
begin
  select coalesce(sum(amount_minor), 0) into v_paid
  from order_payments where order_id = p_order_id;

  select total_minor into v_total from orders where id = p_order_id;
  if v_total is null then
    return; -- order gone (cascade delete in flight)
  end if;

  v_status := case
    when v_paid <= 0 then 'pending'::payment_status
    when v_paid < v_total then 'partial'::payment_status
    else 'paid'::payment_status
  end;

  update orders set
    amount_paid_minor = v_paid,
    payment_status    = v_status,
    -- paid_at = when it first reached fully-paid; cleared otherwise.
    paid_at = case when v_status = 'paid' then coalesce(paid_at, now()) else null end
  where id = p_order_id;
end;
$$;

-- Recompute the parent order whenever its payments change.
create or replace function trg_order_payments_recompute()
returns trigger language plpgsql set search_path = public as $$
begin
  perform recompute_order_payment(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;

create trigger order_payments_recompute
  after insert or update or delete on order_payments
  for each row execute function trg_order_payments_recompute();

-- Recompute when the order total changes (line-item edits) so the derived
-- status follows. recompute() only writes paid/status columns, so this trigger
-- (fired only by subtotal_minor/delivery_fee_minor in the SET list) can't
-- re-fire itself — no recursion.
create or replace function trg_orders_total_recompute()
returns trigger language plpgsql set search_path = public as $$
begin
  perform recompute_order_payment(new.id);
  return null;
end;
$$;

create trigger orders_total_recompute
  after update of subtotal_minor, delivery_fee_minor on orders
  for each row execute function trg_orders_total_recompute();

-- ---- migrate existing data ------------------------------------------------
-- Orders already marked 'paid' had no ledger; record a single full payment so
-- they stay paid (and gain a real entry). Channel from the order's method.
insert into order_payments (order_id, amount_minor, channel, paid_at, created_by)
select o.id, o.total_minor,
  case when o.payment_method = 'bank_transfer'
       then 'bank_transfer'::payment_channel
       else 'cash'::payment_channel end,
  coalesce(o.paid_at, now()), o.created_by
from orders o
where o.payment_status = 'paid' and o.total_minor > 0;

-- Initialise amount_paid_minor + derived status for every order.
select recompute_order_payment(id) from orders;
