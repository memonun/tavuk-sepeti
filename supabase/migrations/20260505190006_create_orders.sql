-- 006_create_orders + order_number sequence
-- SPEC.md §3.5
--
-- order_number is human-friendly and Istanbul-year-prefixed: ORD-2026-00001.
-- Generated in the DB (next_order_number()) so concurrent inserts can't
-- collide.
--
-- delivery_address_snapshot is jsonb — a frozen copy of the customer's
-- address at order time. If the customer later moves, historical orders
-- still show where they were delivered.
--
-- All money in minor units (kuruş) as bigint. line/order totals as
-- generated columns where possible.

create sequence order_number_seq start 1;

create or replace function next_order_number() returns text
language sql as $$
  select 'ORD-'
       || to_char(now() at time zone 'Europe/Istanbul', 'YYYY')
       || '-'
       || lpad(nextval('order_number_seq')::text, 5, '0');
$$;

create table orders (
  id uuid primary key default uuid_generate_v4(),
  order_number text not null unique default next_order_number(),

  customer_id uuid not null references customers(id) on delete restrict,

  status order_status not null default 'pending',

  -- ---- Delivery -----------------------------------------------------------
  -- date (no time) — Europe/Istanbul calendar day. time_slot adds coarse
  -- window when set; nil means "any time that day".
  scheduled_for date not null,
  time_slot time_slot,
  delivery_address_snapshot jsonb not null,
  delivery_notes text check (delivery_notes is null or length(delivery_notes) <= 2000),

  -- ---- Pricing (kuruş, frozen at order time) ------------------------------
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  delivery_fee_minor bigint not null default 0 check (delivery_fee_minor >= 0),
  total_minor bigint generated always as (subtotal_minor + delivery_fee_minor) stored,
  currency text not null default 'TRY' check (currency = 'TRY'),

  -- ---- Payment ------------------------------------------------------------
  payment_method payment_method not null,
  payment_status payment_status not null default 'pending',
  paid_at timestamptz,
  -- Self-check: paid → paid_at present; not-paid → paid_at null.
  constraint orders_paid_at_consistency check (
    (payment_status = 'paid' and paid_at is not null)
    or (payment_status <> 'paid' and paid_at is null)
  ),

  -- ---- Future-proofing ----------------------------------------------------
  -- Forward FK; recurring_templates table created in migration 009 — Postgres
  -- allows this because table refs are checked at constraint evaluation.
  recurring_template_id uuid,
  source order_source not null default 'admin_manual',

  -- ---- Metadata -----------------------------------------------------------
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete restrict
);

create trigger orders_set_updated_at
  before update on orders
  for each row execute function set_updated_at();

comment on column orders.delivery_address_snapshot is
  'Frozen copy of the customer address at order time (jsonb). Independent of any later customer.address mutation.';
comment on column orders.total_minor is
  'subtotal_minor + delivery_fee_minor — generated column; never written directly.';
