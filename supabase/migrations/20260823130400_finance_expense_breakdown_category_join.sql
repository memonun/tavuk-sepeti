-- 20260823130400_finance_expense_breakdown_category_join
--
-- finance_expense_breakdown's signature is UNCHANGED (still (date, date) ->
-- table(category text, amount_minor bigint)) — only the body changes, to
-- resolve the display name through category_id instead of grouping on the
-- raw free-text column. Per CLAUDE.md §7, an RPC's signature is never
-- reshaped in a way that could strand old caller code mid-deploy; a
-- same-signature body swap carries no such risk.
--
-- finance_expense_category_breakdown is new and purely additive — it powers
-- the "Ana Kategoriler | Detay" toggle (spec §18), returning leaf-level rows
-- with their parent attached so the app layer can roll up to Ana Kategori
-- by summing on coalesce(parent_id, category_id).

create or replace function public.finance_expense_breakdown(p_from date, p_to date)
returns table (category text, amount_minor bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(ec.name, e.category, 'Diğer') as category,
    coalesce(sum(e.amount_minor), 0)::bigint as amount_minor
  from expenses e
  left join expense_categories ec on ec.id = e.category_id
  where e.expense_date between p_from and p_to
  group by coalesce(ec.name, e.category, 'Diğer')
  order by amount_minor desc;
$$;

comment on function public.finance_expense_breakdown(date, date) is
  'Gider Dağılımı bars, by resolved category display name. Signature unchanged since V1 — see finance_expense_category_breakdown for the hierarchical (Ana Kategori/Detay) version.';

create or replace function public.finance_expense_category_breakdown(p_from date, p_to date)
returns table (
  category_id uuid,
  category_name text,
  parent_id uuid,
  parent_name text,
  amount_minor bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ec.id as category_id,
    ec.name as category_name,
    ec.parent_id as parent_id,
    parent.name as parent_name,
    coalesce(sum(e.amount_minor), 0)::bigint as amount_minor
  from expenses e
  join expense_categories ec on ec.id = e.category_id
  left join expense_categories parent on parent.id = ec.parent_id
  where e.expense_date between p_from and p_to
  group by ec.id, ec.name, ec.parent_id, parent.name
  order by amount_minor desc;
$$;

comment on function public.finance_expense_category_breakdown(date, date) is
  'Leaf-level Gider Dağılımı rows with parent attached. App layer sums by coalesce(parent_id, category_id) for the Ana Kategoriler view; raw rows are the Detay view. Expenses with no category_id (pre-backfill edge case) are excluded here — they still appear in finance_expense_breakdown via its category/Diğer fallback.';

grant execute on function public.finance_expense_category_breakdown(date, date) to authenticated;
