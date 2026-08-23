-- 20260823090200_finance_generate_recurring_expense_rpc
--
-- generate_recurring_expense — mirrors create_recurring_order
-- (20260622140100) exactly in structure: idempotency pre-check (fast path)
-- + unique_violation exception handler (race-condition safety net), both
-- returning the existing row's id rather than erroring. The generated
-- expense ALWAYS starts payment_status='pending' (spec §12) regardless of
-- amount_type — a routine expense must never automatically become paid.
--
-- No GRANT here — consistent with create_recurring_order's own convention
-- (execute granted separately, below).

create or replace function generate_recurring_expense(
  p_template_id  uuid,
  p_expense_date date,
  p_created_by   uuid  -- nullable; pass null when called by the system
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expense_id uuid;
  v_existing   uuid;
  v_tpl        recurring_expense_templates%rowtype;
begin
  select * into v_tpl
  from recurring_expense_templates
  where id = p_template_id;

  if not found then
    raise exception 'recurring expense template % not found', p_template_id
      using errcode = 'P0001';
  end if;

  if not v_tpl.active then
    raise exception 'recurring expense template % is not active', p_template_id
      using errcode = 'P0001';
  end if;

  -- Idempotency pre-check (avoids hitting the unique index on the happy path).
  select id into v_existing
  from expenses
  where recurring_template_id = p_template_id
    and expense_date          = p_expense_date
    and source                = 'recurring_generated'
  limit 1;

  if found then
    return v_existing;
  end if;

  begin
    insert into expenses (
      category_id,
      amount_minor,
      expense_date,
      payment_status,       -- always pending — never auto-paid
      payment_method,
      vendor,
      description,
      source,
      recurring_template_id,
      created_by
    ) values (
      v_tpl.category_id,
      v_tpl.default_amount_minor,
      p_expense_date,
      'pending',
      v_tpl.payment_method,
      v_tpl.vendor,
      v_tpl.description,
      'recurring_generated',
      p_template_id,
      p_created_by
    )
    returning id into v_expense_id;

  -- Race-condition safety: concurrent duplicate hits the partial unique index.
  exception when unique_violation then
    select id into v_expense_id
    from expenses
    where recurring_template_id = p_template_id
      and expense_date          = p_expense_date
      and source                = 'recurring_generated'
    limit 1;

    return v_expense_id;
  end;

  return v_expense_id;
end;
$$;

comment on function generate_recurring_expense(uuid, date, uuid) is
  'Materializes one pending expense row for a recurring template + date, idempotently. Mirrors create_recurring_order.';

grant execute on function generate_recurring_expense(uuid, date, uuid) to authenticated;
