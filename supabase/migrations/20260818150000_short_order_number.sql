-- 20260818150000_short_order_number
--
-- WHY: order_number was 'ORD-2026-00475' — the 'ORD-' prefix and full year
-- carry no information staff actually need day to day, while the one thing
-- they DO want to read at a glance (order date, and delivery-vs-shipping)
-- wasn't in the number at all; they had to open the order or check the
-- separate Kanal badge column.
--
-- New format: YYMMDD-<R|K>-NNNNN, e.g. 260818-R-00476 (18 Aug 2026, Rota/
-- home delivery, seq 00476) or 260818-K-00477 (same day, Kargo). R/K mirror
-- FULFILLMENT_CHANNEL_LABELS in features/orders/domain/order.ts exactly.
--
-- created_at is the encoded date (order placement date, not scheduled
-- delivery date) and the trailing sequence never resets — same single
-- order_number_seq as before, just reformatted. Historical rows keep their
-- existing ORD-YYYY-NNNNN order_number untouched; only new inserts get the
-- new shape. Both shapes coexist forever in the same unique text column.
--
-- A plain column `default` can't see sibling columns (no access to
-- fulfillment_channel), so generation moves from next_order_number() into a
-- BEFORE INSERT trigger, which does see NEW.*. Nothing about the RPCs needs
-- to change: none of them ever included order_number in their insert column
-- list (confirmed across every `insert into orders (...)` in the migration
-- history), and fulfillment_channel is already NOT NULL and always set by
-- every order writer (20260805090300_order_fulfillment_channel.sql:66).

-- ---- order_seq: numeric backbone, kept in sync with order_number_seq -------
alter table orders add column order_seq bigint;

-- Backfill from the existing order_number's trailing 5 digits rather than
-- pulling fresh nextval()s in arbitrary physical-row order — the trailing
-- digits already ARE the sequence value each row was assigned at creation,
-- so this keeps order_seq perfectly chronological across old + new rows.
update orders set order_seq = right(order_number, 5)::bigint
where order_number like 'ORD-%';

alter table orders alter column order_seq set not null;
-- order_number_seq's current value is already past every backfilled value
-- above, so resuming nextval() here for future rows can't collide.
alter table orders alter column order_seq set default nextval('order_number_seq');
alter table orders add constraint orders_order_seq_key unique (order_seq);
create index orders_order_seq_idx on orders (order_seq);

comment on column orders.order_seq is
  'Numeric backbone of order_number (same order_number_seq value baked into its trailing digits). Exists so sort-by-order-number can order by a real number instead of the formatted string, which would sort by channel letter first on same-day ties.';

-- ---- order_number: now trigger-generated, not a plain default -------------
alter table orders alter column order_number drop default;

create or replace function set_short_order_number() returns trigger
language plpgsql as $$
begin
  if new.order_number is null then
    new.order_number :=
      to_char(new.created_at at time zone 'Europe/Istanbul', 'YYMMDD')
      || '-' || (case new.fulfillment_channel
                   when 'delivery' then 'R'
                   else 'K'
                 end)
      || '-' || lpad(new.order_seq::text, 5, '0');
  end if;
  return new;
end;
$$;

comment on function set_short_order_number is
  'Builds order_number as YYMMDD-<R|K>-NNNNN from NEW.created_at/fulfillment_channel/order_seq. created_at and order_seq defaults resolve before BEFORE INSERT triggers run, so both are already populated here.';

create trigger orders_set_short_order_number
  before insert on orders
  for each row execute function set_short_order_number();

drop function if exists next_order_number();
