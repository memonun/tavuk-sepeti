-- 20260611120000_confirm_route_orders_rpc
--
-- Bulk-confirm a day's route orders in one transaction. Dispatching a route
-- ("Onayla & Başlat") accepts its pending orders so the driver can deliver
-- them later (pending → confirmed → delivered). Mirrors the
-- transition_order_status RPC: the orders UPDATE and the order_status_events
-- audit insert are written together so they can't desync.
--
-- Only rows still 'pending' are flipped — already-confirmed/delivered/
-- cancelled orders are left untouched, so the call is idempotent and safe to
-- retry. Returns the ids actually confirmed, so the application layer can
-- write the cross-entity audit_log rows for exactly those orders.
--
-- security invoker + the authenticated grant: runs with the caller's
-- permissions, so RLS (admin-only) still applies — no privilege escalation.

create or replace function confirm_route_orders(
  p_order_ids uuid[],
  p_actor_id uuid
) returns table (order_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  with flipped as (
    update orders o
       set status = 'confirmed',
           updated_at = now()
     where o.id = any (p_order_ids)
       and o.status = 'pending'
    returning o.id
  ),
  ev as (
    insert into order_status_events (order_id, from_status, to_status, actor_id)
    select f.id, 'pending'::order_status, 'confirmed'::order_status, p_actor_id
    from flipped f
    returning order_status_events.order_id
  )
  select ev.order_id from ev;
end;
$$;

revoke all on function confirm_route_orders(uuid[], uuid) from public;
grant execute on function confirm_route_orders(uuid[], uuid) to authenticated;
