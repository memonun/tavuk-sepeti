-- 001_init_extensions
-- SPEC.md §4.1
--
-- uuid-ossp: gen_random_uuid replacement that's portable across PG versions.
-- postgis:   geography(Point,4326) for address coordinates and radius / nearest-N
--            queries; PostGIS is non-negotiable per spec — naive lat/lng filters
--            don't scale and can't ride a GIST index.
-- pg_trgm:   trigram similarity for customer name search ("ali" ≈ "Alì K.").

create extension if not exists "uuid-ossp";
create extension if not exists postgis;
create extension if not exists pg_trgm;
