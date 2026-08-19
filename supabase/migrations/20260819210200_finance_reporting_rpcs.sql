-- 20260819210200_finance_reporting_rpcs
--
-- SQL-side aggregation for the Finans admin section. Following the
-- count_orders_by_customers precedent (20260608120002): security invoker so
-- RLS still applies (admin sees all), single round-trip, exact SUM/COUNT —
-- no PostgREST max-rows truncation and no risk of the admin grid's
-- GRID_PAGE_SIZE=2000 display cap silently under-reporting revenue past
-- 2000 orders (that cap is an owner-approved *display* override for a
-- virtualized grid, not an aggregation license — CLAUDE.md §1/§9).
--
-- Cancelled orders are excluded everywhere revenue is computed. "Toplam
-- Ciro" counts every other status (including pending) — value of sales, not
-- money collected; "Tahsil Edilen" is the order_payments/market_sales
-- ledger only; "Beklenen Ödemeler" is confirmed/shipped/delivered orders
-- with an unpaid balance. See the Finans plan for the full rationale.
--
-- Channel classification mirrors features/finance/domain/finance-channel.ts
-- (classifyFinanceChannel) exactly — that TS function is unit-tested; this
-- SQL CASE is the second implementation of the same rule (the
-- derivePaymentStatus / recompute_order_payment pattern from
-- 20260612120100). Priority: wholesale customer > recurring template >
-- shipping channel > local delivery. This is a pure read-time reporting
-- label — it never writes back to orders.fulfillment_channel, so routing
-- and cargo-exclusion logic are completely unaffected.
--
-- p_date_basis toggles between 'scheduled_for' (delivery day — matches the
-- rest of the admin panel) and 'created_at' (order-entry day), per the
-- Finans period filter. All boundaries are Europe/Istanbul calendar days;
-- Istanbul has had no DST since 2016 (see shared/utils/date.ts), so
-- `at time zone 'Europe/Istanbul'` is a fixed +03:00 shift, matching the
-- app layer's own YYYY-MM-DD string-space math.

create or replace function public.finance_revenue_by_channel(
  p_from date,
  p_to date,
  p_date_basis text default 'scheduled_for'
)
returns table (channel text, revenue_minor bigint, order_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    case
      when c.account_type = 'business' or c.order_type = 'wholesale' then 'wholesale'
      when o.recurring_template_id is not null then 'recurring'
      when o.fulfillment_channel = 'shipping' then 'cargo'
      else 'local_delivery'
    end as channel,
    coalesce(sum(o.total_minor), 0)::bigint as revenue_minor,
    count(*)::bigint as order_count
  from orders o
  join customers c on c.id = o.customer_id
  where o.status <> 'cancelled'
    and (
      case when p_date_basis = 'created_at'
        then (o.created_at at time zone 'Europe/Istanbul')::date
        else o.scheduled_for
      end
    ) between p_from and p_to
  group by 1;
$$;

comment on function public.finance_revenue_by_channel(date, date, text) is
  'Ciro per online-order finance channel (local_delivery/recurring/cargo/wholesale). Market sales are a separate table — see finance_market_revenue.';

-- Market sales revenue, by location. left join so every active location
-- appears even with zero sales in the period (Pazar Satışı reporting wants
-- to show "0" for a stall, not omit it).
create or replace function public.finance_market_revenue(p_from date, p_to date)
returns table (
  location_id uuid,
  location_name text,
  revenue_minor bigint,
  sale_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ml.id,
    ml.name,
    coalesce(sum(ms.total_amount_minor), 0)::bigint,
    count(ms.id)::bigint
  from market_locations ml
  left join market_sales ms
    on ms.location_id = ml.id
   and ms.sale_date between p_from and p_to
  group by ml.id, ml.name
  order by ml.name;
$$;

-- Money actually received: the order_payments ledger (cash/bank/card, all
-- channels — refunds are negative rows so this sum is already net) plus
-- market sales (always fully collected at time of sale, no receivable
-- concept for a physical stall). paid_at/sale_date scoped, NOT
-- p_date_basis — collection is inherently a "when did money arrive" figure.
create or replace function public.finance_collected_amount(p_from date, p_to date)
returns table (orders_minor bigint, market_minor bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (
      select coalesce(sum(op.amount_minor), 0)::bigint
      from order_payments op
      where (op.paid_at at time zone 'Europe/Istanbul')::date between p_from and p_to
    ),
    (
      select coalesce(sum(ms.total_amount_minor), 0)::bigint
      from market_sales ms
      where ms.sale_date between p_from and p_to
    );
$$;

-- Confirmed/shipped/delivered orders with an unpaid balance. Excludes
-- 'pending' (not yet confirmed — not a firm receivable) and 'cancelled'.
create or replace function public.finance_expected_payments(
  p_from date,
  p_to date,
  p_date_basis text default 'scheduled_for'
)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(o.total_minor - o.amount_paid_minor), 0)::bigint
  from orders o
  where o.status in ('confirmed', 'shipped', 'delivered')
    and o.total_minor - o.amount_paid_minor > 0
    and (
      case when p_date_basis = 'created_at'
        then (o.created_at at time zone 'Europe/Istanbul')::date
        else o.scheduled_for
      end
    ) between p_from and p_to;
$$;

-- Toplam Gider / Bekleyen Giderler / paid (the figure Net Durum subtracts).
create or replace function public.finance_expense_summary(p_from date, p_to date)
returns table (total_minor bigint, paid_minor bigint, pending_minor bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(amount_minor), 0)::bigint,
    coalesce(sum(amount_minor) filter (where payment_status = 'paid'), 0)::bigint,
    coalesce(sum(amount_minor) filter (where payment_status = 'pending'), 0)::bigint
  from expenses
  where expense_date between p_from and p_to;
$$;

-- Gider Dağılımı bars.
create or replace function public.finance_expense_breakdown(p_from date, p_to date)
returns table (category text, amount_minor bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select category, coalesce(sum(amount_minor), 0)::bigint as amount_minor
  from expenses
  where expense_date between p_from and p_to
  group by category
  order by amount_minor desc;
$$;

-- En Çok Satılan Ürünler.
create or replace function public.finance_market_top_products(
  p_from date,
  p_to date,
  p_limit int default 10
)
returns table (product_key text, product_name text, total_quantity numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select p.key, p.display_name, sum(msi.quantity) as total_quantity
  from market_sale_items msi
  join market_sales ms on ms.id = msi.sale_id
  join products p on p.key = msi.product_key
  where ms.sale_date between p_from and p_to
  group by p.key, p.display_name
  order by total_quantity desc
  limit p_limit;
$$;
