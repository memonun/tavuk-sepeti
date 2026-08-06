-- 20260805090400_orders_address_id
--
-- WHY: find_orders_for_route joins `addresses on a.customer_id = c.id and
-- a.is_primary` — the customer's LIVE primary address. Two consequences, both
-- bad, both silent:
--
--   1. An order is routed to wherever the customer lives NOW. Edit a pending
--      order's customer address and tomorrow's van goes somewhere else, while the
--      admin order panel still shows the frozen snapshot. No warning anywhere.
--   2. It is an INNER JOIN. A customer with no primary address makes their orders
--      completely INVISIBLE to the route — not flagged, just absent.
--
-- Binding the order to the address it was actually placed to fixes both, and
-- NOT NULL makes the "invisible order" class structurally impossible.
--
-- ON DELETE RESTRICT: an address that carries order history can no longer be
-- deleted out from under the route. orders.customer_id is already RESTRICT, so
-- customer deletion behaviour is unchanged.

-- Re-runnable, like the previous migration: the loop below only ever touches
-- orders whose address_id is still null, so a retry cannot create duplicate
-- synthesized addresses.
alter table orders
  add column if not exists address_id uuid references addresses(id) on delete restrict;

-- ---- Step 1: the happy path — today's route target, made explicit ------------
-- Pointing at the current primary address reproduces exactly what the route
-- resolves today, so this migration changes no routing decision for these rows.
update orders o
   set address_id = (
     select a.id from addresses a
     where a.customer_id = o.customer_id and a.is_primary
     limit 1
   )
 where o.address_id is null;

-- ---- Step 2: recover the residue --------------------------------------------
-- Orders whose customer has no primary address are the invisible ones from (2)
-- above. We still hold their frozen 13-key snapshot, so we can reconstruct an
-- address row from it and re-attach them. One row per order, preserving each
-- order's own historical address rather than collapsing them together.
--
-- They come back with whatever pin the snapshot had — often (0,0), which
-- missingDeliveryFields already reports as "Konum" missing. So these orders
-- reappear on the route FLAGGED RED instead of vanishing. That is a deliberate,
-- visible behaviour change; the notice below reports how many.
do $$
declare
  r record;
  v_address_id uuid;
  v_count int := 0;
begin
  for r in
    select o.id as order_id, o.customer_id, o.delivery_address_snapshot as snap
    from orders o
    where o.address_id is null
  loop
    insert into addresses (
      customer_id, raw_text, description, lat, lng, source, accuracy,
      city, district, neighborhood, street, building_no, apartment_no, postal_code,
      is_primary, address_source
    ) values (
      r.customer_id,
      left(coalesce(nullif(trim(r.snap->>'raw_text'), ''), 'Adres kaydı yok'), 500),
      nullif(trim(r.snap->>'description'), ''),
      -- Bounds-guarded: the addresses CHECKs reject out-of-range values, and a
      -- legacy snapshot is not something we want to trust blindly.
      coalesce(nullif(r.snap->>'lat', '')::double precision, 0),
      coalesce(nullif(r.snap->>'lng', '')::double precision, 0),
      case when r.snap->>'source' in
             ('geocoded_auto','geocoded_manual','user_pin','admin_corrected')
           then (r.snap->>'source')::coordinate_source
           else 'geocoded_auto'::coordinate_source end,
      case when r.snap->>'accuracy' in
             ('rooftop','range_interpolated','geometric_center','approximate','unknown')
           then (r.snap->>'accuracy')::coordinate_accuracy
           else 'unknown'::coordinate_accuracy end,
      nullif(trim(r.snap->>'city'), ''),
      nullif(trim(r.snap->>'district'), ''),
      nullif(trim(r.snap->>'neighborhood'), ''),
      nullif(trim(r.snap->>'street'), ''),
      nullif(trim(r.snap->>'building_no'), ''),
      nullif(trim(r.snap->>'apartment_no'), ''),
      nullif(trim(r.snap->>'postal_code'), ''),
      false,          -- never steal the primary slot
      'bulk_import'
    )
    returning id into v_address_id;

    update orders set address_id = v_address_id where id = r.order_id;
    v_count := v_count + 1;
  end loop;

  raise notice
    'orders_address_id: recovered % order(s) that had no primary address and were invisible to the route',
    v_count;
end $$;

alter table orders alter column address_id set not null;

comment on column orders.address_id is
  'The address this order is delivered to. The route joins THIS, not the customer''s current primary address — editing an address no longer silently redirects a pending order.';

-- Route join, plus "which orders depend on this address" when an admin edits or
-- deletes one (the ON DELETE RESTRICT check needs it too).
create index if not exists orders_address_id_idx on orders (address_id);
