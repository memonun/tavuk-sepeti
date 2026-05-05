-- 018_transition_order_status_rpc
--
-- Atomic status transition: update orders.status + write the
-- order_status_events audit row. The state-machine validation lives in
-- the TypeScript reducer (single source of truth, fully unit-tested);
-- this RPC trusts a valid transition has been computed and just persists.
--
-- Caller passes the reason (required for cancellations, optional otherwise)
-- and actor id. RLS gates execution — admin-only via is_admin().

create or replace function transition_order_status(
  p_order_id uuid,
  p_to_status order_status,
  p_reason text,
  p_actor_id uuid
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_from_status order_status;
begin
  select status into v_from_status from orders where id = p_order_id;
  if not found then
    raise exception 'order % not found', p_order_id using errcode = 'P0002';
  end if;

  update orders
     set status = p_to_status,
         updated_at = now()
   where id = p_order_id;

  insert into order_status_events (order_id, from_status, to_status, reason, actor_id)
  values (p_order_id, v_from_status, p_to_status, p_reason, p_actor_id);
end;
$$;

revoke all on function transition_order_status(uuid, order_status, text, uuid) from public;
grant execute on function transition_order_status(uuid, order_status, text, uuid) to authenticated;
