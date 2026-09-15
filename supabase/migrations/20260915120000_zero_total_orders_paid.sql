-- 20260915120000_zero_total_orders_paid
--
-- WHY: a free/complimentary order (e.g. product sent to an influencer,
-- total forced to 0 via a special price) could never be marked paid. Two
-- compounding bugs:
--
--   1. recompute_order_payment()'s CASE checked `v_paid <= 0` BEFORE
--      checking the total, so a (total=0, paid=0) order fell into
--      'pending' and never reached the 'paid' branch — nothing was wrong
--      with it, there was just nothing to collect.
--
--   2. recompute_order_payment() only ever runs via the trigger on
--      order_payments writes. A free order has no payment to record
--      against it, so that trigger never fires at all — payment_status
--      stays stuck at its creation-time default ('pending') forever, with
--      no admin action able to change it (the "Tamamı ödendi" shortcut
--      itself already no-ops when balance <= 0 — see
--      features/orders/application/payments.ts's markOrderFullyPaidAction).
--
-- Fixes:
--   - CASE: total_minor <= 0 is unconditionally 'paid', checked first.
--   - A new trigger recomputes payment_status whenever an order's total
--     changes (creation AND editing), not just when a payment is written.
--     total_minor itself is a generated column (subtotal_minor +
--     delivery_fee_minor), so the trigger watches those two underlying
--     columns instead — both are written directly by
--     create_order_with_items_v2 and update_order_with_items.
--   - A one-time backfill recomputes every already-stuck zero-total order
--     (exactly the influencer-order scenario this migration exists for).
--
-- Mirrors features/orders/domain/payment.ts's derivePaymentStatus fix —
-- "one rule, two implementations" (see that file's header comment).

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
    when v_total <= 0 then 'paid'::payment_status
    when v_paid <= 0 then 'pending'::payment_status
    when v_paid < v_total then 'partial'::payment_status
    else 'paid'::payment_status
  end;

  update orders set
    amount_paid_minor = v_paid,
    payment_status    = v_status,
    paid_at = case when v_status = 'paid' then coalesce(paid_at, now()) else null end
  where id = p_order_id;
end;
$$;

create or replace function trg_orders_total_recompute()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform recompute_order_payment(new.id);
  return null;
end;
$$;

drop trigger if exists orders_total_recompute on orders;
create trigger orders_total_recompute
  after insert or update of subtotal_minor, delivery_fee_minor on orders
  for each row execute function trg_orders_total_recompute();

-- Backfill: every existing order stuck at total<=0 but not yet 'paid'.
do $$
declare
  v_order_id uuid;
begin
  for v_order_id in
    select id from orders where total_minor <= 0 and payment_status <> 'paid'
  loop
    perform recompute_order_payment(v_order_id);
  end loop;
end;
$$;
