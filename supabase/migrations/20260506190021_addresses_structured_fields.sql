-- 021_addresses_structured_fields
-- Splits the single-blob address input into Turkish-standard structured
-- fields so admin can capture il / ilçe / mahalle separately. The geocoder
-- pipeline will populate these from Google's address_components when
-- possible; admin can override.
--
-- All columns nullable — existing rows stay valid. New rows from the
-- updated form will fill at least neighborhood/district/city.
--
-- raw_text stays for legacy display + search fallback; new write path
-- composes it from the structured fields.

alter table addresses
  add column neighborhood text,           -- mahalle
  add column street text,                 -- cadde / sokak adı
  add column building_no text,            -- bina no (text — "12A", "12/3" gibi)
  add column apartment_no text;           -- daire no

comment on column addresses.neighborhood is 'Mahalle. Türkçe adres standardının ana parçası — geocoder Google address_components.sublocality_level_1 ya da administrative_area_level_4''ten doldurur.';
comment on column addresses.street is 'Cadde, sokak veya bulvar adı.';
comment on column addresses.building_no is 'Bina kapı numarası. Text — "12A", "12/3", "B-7" gibi yaygın yazımları kabul eder.';
comment on column addresses.apartment_no is 'Daire numarası (opsiyonel).';
