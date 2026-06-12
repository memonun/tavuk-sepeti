-- 20260612180000_saved_locations
--
-- Saved start locations for route optimization. Replaces the single env
-- WAREHOUSE_LAT/LNG pair with a DB-backed, multi-row convention: the driver
-- picks a start location (a saved one or their live position) before optimizing.
-- Seeds the existing warehouse coordinate as the default "Apuhan Çiftliği".
--
-- Coordinates follow the addresses convention: plain lat/lng double precision
-- (no PostGIS geography here — we only need the point as a Directions origin,
-- not spatial queries).

create table saved_locations (
  id uuid primary key default uuid_generate_v4(),
  name text not null check (length(trim(name)) > 0),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  -- Exactly one row may be the default (enforced by the partial unique index).
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one default saved location.
create unique index saved_locations_one_default_idx
  on saved_locations (is_default)
  where is_default;

create trigger saved_locations_set_updated_at
  before update on saved_locations
  for each row execute function set_updated_at();

alter table saved_locations enable row level security;

-- Admin-only, matching every other table. (select is_admin()) so the predicate
-- evaluates once per query, not per row (RLS initplan).
create policy saved_locations_admin_all on saved_locations
  for all to authenticated
  using ((select is_admin())) with check ((select is_admin()));

-- Seed the current warehouse origin as the default.
insert into saved_locations (name, lat, lng, is_default)
values ('Apuhan Çiftliği', 38.38121777808671, 38.071717283006095, true);
