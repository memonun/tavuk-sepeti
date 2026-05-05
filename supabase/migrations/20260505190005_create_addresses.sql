-- 005_create_addresses
-- SPEC.md §3.4 — value object table; one-to-one in Faz 1, one-to-many ready.
--
-- coordinate is geography(Point, 4326) — PostGIS native. The plain lat/lng
-- columns are mirrored for read-easy queries and form binding; a trigger
-- keeps them in sync with `coordinate` (no chance of drift).
--
-- A GIST index on `coordinate` makes radius / bbox / nearest-N queries
-- (find_customers_within_radius, map bounds) O(log n) instead of O(n).

create table addresses (
  id uuid primary key default uuid_generate_v4(),

  customer_id uuid not null references customers(id) on delete cascade,

  raw_text text not null
    check (length(trim(raw_text)) between 1 and 500),
  description text check (description is null or length(description) <= 500),

  -- The single source of truth for the spatial query layer.
  coordinate geography(Point, 4326) not null,
  -- Mirrors of coordinate, kept in sync by trigger. Useful for form binding,
  -- JSON serialization, and any code that doesn't want to parse WKT.
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),

  source coordinate_source not null,
  accuracy coordinate_accuracy not null,
  geocoded_at timestamptz,
  -- Hash of the upstream Google response — lets us detect when a re-geocode
  -- would change the answer (cache invalidation signal).
  geocoder_response_hash text,

  city text,
  district text,
  postal_code text,
  country text not null default 'TR',

  -- Faz 1: always true (single primary address per customer). Faz 2: a
  -- customer may have several; this flag marks the default delivery target.
  is_primary boolean not null default true,

  -- How this address record was created. Distinct from coordinate.source —
  -- that's about the pin, this is about the row.
  address_source address_source not null default 'admin_input',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sync the geography column from lat/lng on insert/update so callers can
-- write either field set and the other follows automatically.
create or replace function sync_address_coordinate() returns trigger
language plpgsql as $$
begin
  new.coordinate := st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography;
  return new;
end;
$$;

create trigger addresses_sync_coordinate
  before insert or update of lat, lng on addresses
  for each row execute function sync_address_coordinate();

create trigger addresses_set_updated_at
  before update on addresses
  for each row execute function set_updated_at();

-- Faz 1 invariant: at most one primary address per customer. Filter index
-- so non-primary rows don't compete for the slot.
create unique index addresses_one_primary_per_customer
  on addresses (customer_id)
  where is_primary;

comment on column addresses.coordinate is
  'PostGIS geography(Point, 4326). Kept in sync with lat/lng by trigger.';
