-- 20260805090200_service_areas
--
-- WHY: "Malatya içi" is advertised on the storefront but never enforced — today
-- an İstanbul address can order fresh eggs. The check has to be authoritative,
-- because the customer confirms the map pin themselves and can drag it anywhere
-- after picking an address.
--
-- The authority is a geometric point-in-polygon test on the CONFIRMED PIN, not a
-- comparison of the typed `city` string and not a reverse-geocode:
--
--   * Typed city — user input; trivially wrong or spoofed, and Turkish casing
--     breaks naive comparison ("İSTANBUL".toLowerCase() yields i + a combining
--     dot in JS, not "i"). Kept as a client-side pre-filter, never the authority.
--   * Reverse geocode — puts an external dependency on the order path (Google
--     down = no route orders at all); every pin is a distinct coordinate so the
--     geocoding cache hit rate is ~0, which contradicts CLAUDE.md §8's cache-first
--     rule and §14's "an uncached Google call needs a justification"; and it
--     answers the wrong question — "which province administratively" is not
--     "can the van reach it tomorrow".
--   * PostGIS — already installed, addresses.coordinate is already
--     geography(Point,4326). Sub-millisecond with a GIST index, deterministic,
--     offline, and it runs INSIDE the insert transaction so it cannot be raced or
--     replayed around. The zone is DATA, not code: shrinking it to what we
--     actually drive, or adding a second province later, is a row update.

create table service_areas (
  id uuid primary key default uuid_generate_v4(),
  name text not null check (length(trim(name)) between 1 and 100),
  -- The province string the storefront advertises. Used only for the fallback
  -- path and for admin display — the polygon is what decides.
  province text not null check (length(trim(province)) between 1 and 100),
  area geography(MultiPolygon, 4326) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- GIST is THE index that makes this check free. Without it every checkout does a
-- seq scan + full polygon test; with it, point-in-polygon is O(log n). CLAUDE.md
-- §1 (1000 concurrent users) makes this non-optional, not an optimisation.
create index service_areas_area_gix on service_areas using gist (area);

create trigger service_areas_set_updated_at
  before update on service_areas
  for each row execute function set_updated_at();

alter table service_areas enable row level security;

-- Public read: the storefront pre-checks the pin before submit so the customer
-- gets an inline error instead of a rejected order. The polygon leaks nothing —
-- it is the delivery area we already advertise.
create policy service_areas_public_read on service_areas
  for select to anon, authenticated
  using (active);

create policy service_areas_admin_all on service_areas
  for all to authenticated
  using (is_admin()) with check (is_admin());

comment on table service_areas is
  'Polygons we hand-deliver inside. A route order''s confirmed pin must fall in one. Edit the polygon (data) to change the zone — no deploy needed.';

-- ---- The check ---------------------------------------------------------------
-- THREE-VALUED ON PURPOSE:
--   true  → inside a configured zone
--   false → outside every configured zone
--   null  → NO zone configured at all
-- `null` lets callers fall back to the normalized province-string compare and log
-- a warning. Fail-closed would let a single seeding mistake block 100% of route
-- orders; silently failing open would be worse than both. Making "unconfigured"
-- its own value forces the fallback to be explicit and observable.

create or replace function is_within_service_area(
  p_lat double precision,
  p_lng double precision
) returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when p_lat is null or p_lng is null then null
    when not exists (select 1 from service_areas where active) then null
    else exists (
      select 1 from service_areas s
      where s.active
        and st_covers(s.area, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
    )
  end;
$$;

comment on function is_within_service_area is
  'true = inside a delivery zone, false = outside, NULL = no zone configured (caller falls back to a province-name compare and logs a warning).';

grant execute on function is_within_service_area(double precision, double precision)
  to anon, authenticated, service_role;

-- ---- Seed: Malatya ----------------------------------------------------------
-- A DELIBERATELY GENEROUS simplified outline of Malatya province. Being too wide
-- on day one only means a handful of edge orders we can hand-check; being too
-- narrow silently rejects real paying customers, which is the worse failure.
--
-- Refine it (or replace it with the zone actually driven) with:
--   update service_areas set area = st_geomfromtext('MULTIPOLYGON(((...)))', 4326)
--   where name = 'Malatya';
-- Coordinates are WKT order: longitude latitude.
insert into service_areas (name, province, area)
values (
  'Malatya',
  'Malatya',
  st_geomfromtext(
    'MULTIPOLYGON(((
       37.00 38.60,
       37.20 38.95,
       37.80 39.10,
       38.40 39.15,
       38.90 38.90,
       39.10 38.55,
       39.05 38.15,
       38.70 37.85,
       38.20 37.90,
       37.70 38.05,
       37.30 38.25,
       37.00 38.60
     )))',
    4326
  )::geography
);
