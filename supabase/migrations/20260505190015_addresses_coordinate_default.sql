-- 015_addresses_coordinate_default
--
-- The lat/lng-sync trigger on `addresses` populates `coordinate` from the
-- supplied lat/lng on INSERT — so callers should never need to provide
-- `coordinate` explicitly. Without a column DEFAULT, however,
-- `supabase gen types` marks Insert['coordinate'] as required, forcing every
-- insert site to pass a placeholder.
--
-- Adding a (0,0) Point default makes the column optional in the generated
-- types. The trigger overwrites it with the real coordinate on the same
-- statement, so the default is never observed at rest.

alter table addresses
  alter column coordinate
  set default st_setsrid(st_makepoint(0, 0), 4326)::geography;

comment on column addresses.coordinate is
  'PostGIS geography(Point, 4326). Trigger sets from lat/lng; default is a placeholder so generated types treat it as optional in Insert.';
