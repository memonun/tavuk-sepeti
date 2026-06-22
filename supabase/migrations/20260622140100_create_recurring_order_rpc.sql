-- 20260622140100_create_recurring_order_rpc
--
-- create_recurring_order — mirrors create_order_with_items_v2 exactly in
-- structure (address snapshot, jsonb_to_recordset subtotal, order_items insert,
-- initial order_status_events null→'pending'), with three differences:
--   1. Source is always 'recurring_generated'; no time_slot / delivery_notes /
--      delivery_fee_minor from caller — those are fixed/defaulted here.
--   2. payment_method comes from the template, not from a caller parameter.
--   3. Full idempotency: pre-check (fast path) + unique_violation catch (race
--      condition safety net) both return the existing order id rather than error.
--
-- No GRANT — consistent with sibling RPCs in this repo.

create or replace function create_recurring_order(
  p_template_id   uuid,
  p_scheduled_for date,
  p_created_by    uuid,   -- nullable; pass null when called by the system
  p_items         jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id        uuid;
  v_existing        uuid;
  v_tpl             recurring_templates%rowtype;
  v_address_row     addresses%rowtype;
  v_address_snapshot jsonb;
  v_subtotal        bigint := 0;
begin
  -- 1. Load and validate the template.
  select * into v_tpl
  from recurring_templates
  where id = p_template_id;

  if not found then
    raise exception 'recurring template % not found', p_template_id
      using errcode = 'P0001';
  end if;

  if not v_tpl.active then
    raise exception 'recurring template % is not active', p_template_id
      using errcode = 'P0001';
  end if;

  -- 2. Idempotency pre-check (avoids hitting the unique index on the happy path).
  select id into v_existing
  from orders
  where recurring_template_id = p_template_id
    and scheduled_for          = p_scheduled_for
    and source                 = 'recurring_generated'
  limit 1;

  if found then
    return v_existing;
  end if;

  -- 3. Snapshot the customer's primary address — identical block to v2.
  select * into v_address_row
  from addresses a
  where a.customer_id = v_tpl.customer_id and a.is_primary
  limit 1;

  if not found then
    raise exception 'customer % has no primary address', v_tpl.customer_id
      using errcode = 'P0001';
  end if;

  v_address_snapshot := jsonb_build_object(
    'raw_text',     v_address_row.raw_text,
    'description',  v_address_row.description,
    'lat',          v_address_row.lat,
    'lng',          v_address_row.lng,
    'accuracy',     v_address_row.accuracy::text,
    'source',       v_address_row.source::text,
    'city',         v_address_row.city,
    'district',     v_address_row.district,
    'neighborhood', v_address_row.neighborhood,
    'street',       v_address_row.street,
    'building_no',  v_address_row.building_no,
    'apartment_no', v_address_row.apartment_no,
    'postal_code',  v_address_row.postal_code
  );

  -- 4. Compute subtotal — identical jsonb_to_recordset pattern to v2.
  select coalesce(sum((x.quantity * x.unit_price_minor)::bigint), 0)
    into v_subtotal
  from jsonb_to_recordset(p_items) as x(
    quantity         numeric,
    unit_price_minor bigint
  );

  begin
    -- 5. Insert the order.  Differences from v2 are called out inline.
    insert into orders (
      customer_id,
      scheduled_for,
      time_slot,                   -- null for recurring-generated orders
      payment_method,              -- from template, not caller
      delivery_notes,              -- null
      subtotal_minor,
      delivery_fee_minor,          -- 0 (no surcharge at generation time)
      delivery_address_snapshot,
      created_by,
      source,                      -- 'recurring_generated'
      recurring_template_id        -- FK back to template
    ) values (
      v_tpl.customer_id,
      p_scheduled_for,
      null,
      v_tpl.payment_method,
      null,
      v_subtotal,
      0,
      v_address_snapshot,
      p_created_by,
      'recurring_generated',
      p_template_id
    )
    returning id into v_order_id;

    -- 6. Insert order_items — identical columns to v2.
    insert into order_items (
      order_id, product_key, quantity, unit_price_minor, product_snapshot
    )
    select
      v_order_id,
      x.product_key,
      x.quantity,
      x.unit_price_minor,
      x.product_snapshot
    from jsonb_to_recordset(p_items) as x(
      product_key      text,
      quantity         numeric,
      unit_price_minor bigint,
      product_snapshot jsonb
    );

    -- 7. Initial status event — identical to v2.
    insert into order_status_events (order_id, from_status, to_status, actor_id)
    values (v_order_id, null, 'pending', p_created_by);

  -- 8. Race-condition safety: concurrent duplicate hits the partial unique index.
  exception when unique_violation then
    select id into v_order_id
    from orders
    where recurring_template_id = p_template_id
      and scheduled_for          = p_scheduled_for
      and source                 = 'recurring_generated'
    limit 1;

    return v_order_id;
  end;

  -- 9. Return the new order id.
  return v_order_id;
end;
$$;
