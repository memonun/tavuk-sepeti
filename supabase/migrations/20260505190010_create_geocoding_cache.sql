-- 010_create_geocoding_cache
-- SPEC.md §6.2 — every Google Geocoding response cached by normalized-input hash.
--
-- The hash is sha256(normalized_address + country) computed in the app layer.
-- Cache hits short-circuit the Google call (cost + rate-limit protection).
-- raw_response retains the full Google payload so we can re-derive accuracy
-- if our mapping logic changes.
--
-- hit_count + last_seen_at are touched on every cache hit so we know which
-- records earn their keep when we eventually GC stale entries.

create table geocoding_cache (
  id uuid primary key default uuid_generate_v4(),

  input_hash text not null unique,
  input_normalized text not null,

  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy coordinate_accuracy not null,
  raw_response jsonb not null,

  hit_count integer not null default 1 check (hit_count >= 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Daily quota tracking — see SPEC.md §6.3. One row per Google Geocoding API
-- call so the hard-stop logic can count today's usage cheaply.

create table geocoding_api_calls (
  id uuid primary key default uuid_generate_v4(),
  called_at timestamptz not null default now(),
  status text not null,                 -- 'OK' | 'ZERO_RESULTS' | 'OVER_QUERY_LIMIT' | …
  response_time_ms integer not null check (response_time_ms >= 0),
  input_hash text                       -- nullable when call is for a non-cached path
);

create index geocoding_api_calls_called_at_idx on geocoding_api_calls (called_at desc);
