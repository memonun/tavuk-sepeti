-- 20260921120000_saved_location_malatya_park_life
--
-- The route planner's start / destination pickers list saved_locations, and the
-- only row was the default "Apuhan Çiftliği" (20260612180000). The owner wants
-- Malatya Park Life (https://maps.app.goo.gl/fjUyAGYLtdoUJJoh8) selectable too.
--
-- Coordinates are the place pin from that Google Maps link (!3d / !4d).
-- Never the default: the partial unique index allows exactly one default and
-- that stays Apuhan Çiftliği. Idempotent — re-running (or a location the admin
-- already saved at the same point via "Elle adres gir…") inserts nothing.

insert into saved_locations (name, lat, lng, is_default)
select 'Malatya Park Life', 38.3497525, 38.2986094, false
where not exists (
  select 1 from saved_locations
  where lat = 38.3497525 and lng = 38.2986094
);
