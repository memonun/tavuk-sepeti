-- 20260805090300_order_fulfillment_channel
--
-- WHY: today an order's route membership is DERIVED at query time from the
-- CURRENT products.fulfillment_type:
--
--   and exists (select 1 from order_items oi join products p on p.key = oi.product_key
--               where oi.order_id = o.id and p.fulfillment_type = 'delivery')
--
-- So an admin flipping one product from delivery to shipping retroactively moves
-- past AND pending orders on/off the route. That is the actual "spill over" the
-- owner is worried about. Fix it the same way prices are fixed: compute the
-- channel when the order is created and FREEZE it.
--
-- Vocabulary note: the enum reuses products.fulfillment_type's words
-- ('delivery' / 'shipping') rather than inventing route/cargo. One concept, one
-- vocabulary. The Turkish UI labels stay "Rota" / "Kargo".

-- Every statement below is written to be re-runnable. A first attempt failed
-- part-way through (the backfill CASE below), and depending on how the runner
-- wrapped the file, some of the earlier DDL may already be in place.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'fulfillment_channel') then
    create type fulfillment_channel as enum ('delivery', 'shipping');
  end if;
end $$;

-- ---- Per-line frozen fulfillment type ---------------------------------------
-- A real column, not a key inside product_snapshot jsonb: the route query and
-- reports filter on it, and `->>` is untyped and unindexable.
alter table order_items
  add column if not exists fulfillment_type text not null default 'delivery'
    check (fulfillment_type in ('delivery', 'shipping'));

update order_items oi
   set fulfillment_type = p.fulfillment_type
  from products p
 where p.key = oi.product_key
   and oi.fulfillment_type is distinct from p.fulfillment_type;

comment on column order_items.fulfillment_type is
  'Frozen copy of products.fulfillment_type at order time. Changing the product later never rewrites this.';

-- ---- Order-level channel ----------------------------------------------------
alter table orders add column if not exists fulfillment_channel fulfillment_channel;

-- BEHAVIOUR-PRESERVING backfill. This predicate is character-for-character the
-- EXISTS clause find_orders_for_route uses today, so every order currently on the
-- route stays on the route and no other order joins it.
--
-- Both CASE branches carry an explicit ::fulfillment_channel cast. Without them
-- the branches are `unknown` literals, CASE resolves the whole expression to
-- `text`, and Postgres refuses text -> enum in an UPDATE SET:
--   ERROR: column "fulfillment_channel" is of type fulfillment_channel but
--          expression is of type text (42804)
update orders o set fulfillment_channel = case
  when exists (
    select 1 from order_items oi
    join products p on p.key = oi.product_key
    where oi.order_id = o.id and p.fulfillment_type = 'delivery'
  ) then 'delivery'::fulfillment_channel
  else 'shipping'::fulfillment_channel
end
where o.fulfillment_channel is null;

alter table orders alter column fulfillment_channel set not null;

comment on column orders.fulfillment_channel is
  'delivery = hand-delivered on our route; shipping = sent by cargo. Computed from the items at creation and FROZEN — a later products.fulfillment_type edit does not move existing orders.';

-- Serves both hot queries: the daily route scan and the cargo queue.
create index if not exists orders_channel_scheduled_idx
  on orders (fulfillment_channel, scheduled_for);

-- ---- Channel resolvers -------------------------------------------------------
-- Both look the type up from `products`, never from caller-supplied jsonb, so a
-- client cannot spoof its way onto (or off) the route.

-- Pre-insert form: the writers need the channel before the order row exists.
create or replace function resolve_channel_for_items(p_items jsonb)
returns fulfillment_channel
language sql
stable
security invoker
set search_path = public
as $$
  -- Owner decision 2026-08-05: a mixed basket delivered inside Malatya is ONE
  -- route order — the cargo-capable goods ride along in the van rather than
  -- being shipped. So "any delivery line" ⇒ delivery. Same rule as the EXISTS
  -- clause it replaces.
  select case when exists (
    select 1
    from jsonb_to_recordset(p_items) as x(product_key text)
    join products p on p.key = x.product_key
    where p.fulfillment_type = 'delivery'
  ) then 'delivery'::fulfillment_channel
    else 'shipping'::fulfillment_channel
  end;
$$;

-- Post-write form: used after an edit rewrites an order's items.
create or replace function resolve_order_channel(p_order_id uuid)
returns fulfillment_channel
language sql
stable
security invoker
set search_path = public
as $$
  select case when exists (
    select 1 from order_items oi
    where oi.order_id = p_order_id and oi.fulfillment_type = 'delivery'
  ) then 'delivery'::fulfillment_channel
    else 'shipping'::fulfillment_channel
  end;
$$;

-- ---- The one true address snapshot ------------------------------------------
-- Every order writer (admin, recurring, web) calls THIS, so the frozen 13-key
-- snapshot cannot drift between channels. Previously each writer built its own
-- jsonb_build_object and the web one used a different shape entirely.
create or replace function address_snapshot(a addresses)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'raw_text',     a.raw_text,
    'description',  a.description,
    'lat',          a.lat,
    'lng',          a.lng,
    'accuracy',     a.accuracy::text,
    'source',       a.source::text,
    'city',         a.city,
    'district',     a.district,
    'neighborhood', a.neighborhood,
    'street',       a.street,
    'building_no',  a.building_no,
    'apartment_no', a.apartment_no,
    'postal_code',  a.postal_code
  );
$$;

comment on function address_snapshot is
  'The frozen delivery-address snapshot written onto orders. Single definition shared by create_order_with_items, create_recurring_order and place_web_order so admin and web orders are byte-identical.';
