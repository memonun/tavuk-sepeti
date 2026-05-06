/**
 * Composes Turkish-structured address parts into a single human-readable
 * line + a normalized form for the Google Geocoder query.
 *
 * Both outputs are derived from the same structured input — the form is
 * the source of truth, raw_text is a denormalized convenience for legacy
 * display + fallback search.
 *
 * Format follows the postal convention used on TR addresses:
 *   "{street} {building_no}/{apartment_no}, {neighborhood} Mh.,
 *    {district}/{city} {postal_code} Türkiye"
 *
 * Empty parts are skipped so the line stays clean for partial addresses.
 */

export interface AddressParts {
  // `unknown` so callers can pass react-hook-form's z.input types directly
  // without a per-field cast — runtime check below normalizes anything
  // non-string to "".
  city?: unknown;            // İl
  district?: unknown;        // İlçe
  neighborhood?: unknown;    // Mahalle
  street?: unknown;          // Cadde / Sokak
  building_no?: unknown;     // Bina no
  apartment_no?: unknown;    // Daire no
  postal_code?: unknown;     // Posta kodu
}

const trim = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/** Human-readable single-line address, suitable for raw_text storage and
 *  for display in tables / order snapshots. */
export function composeFullAddress(parts: AddressParts): string {
  const street = trim(parts.street);
  const buildingNo = trim(parts.building_no);
  const apartmentNo = trim(parts.apartment_no);
  const neighborhood = trim(parts.neighborhood);
  const district = trim(parts.district);
  const city = trim(parts.city);
  const postalCode = trim(parts.postal_code);

  // Street + building/apartment as one segment ("Atatürk Cd. No:12/3").
  let streetSegment = street;
  if (buildingNo) {
    streetSegment = streetSegment
      ? `${streetSegment} No: ${buildingNo}`
      : `No: ${buildingNo}`;
  }
  if (apartmentNo) {
    streetSegment = streetSegment
      ? `${streetSegment}/${apartmentNo}`
      : `D: ${apartmentNo}`;
  }

  const neighborhoodSegment = neighborhood ? `${neighborhood} Mh.` : "";

  // District / city combine with a slash, postal code appends.
  let regionSegment = "";
  if (district && city) regionSegment = `${district}/${city}`;
  else if (district) regionSegment = district;
  else if (city) regionSegment = city;
  if (postalCode) {
    regionSegment = regionSegment
      ? `${regionSegment} ${postalCode}`
      : postalCode;
  }

  const parts_filtered = [streetSegment, neighborhoodSegment, regionSegment].filter(
    (segment) => segment.length > 0,
  );

  return parts_filtered.join(", ");
}

/** Same as composeFullAddress but appends "Türkiye" so Google biases
 *  results to TR. The geocode pipeline uses this form. */
export function composeGeocoderQuery(parts: AddressParts): string {
  const base = composeFullAddress(parts);
  return base ? `${base}, Türkiye` : "";
}

/** True when we have enough fields for a meaningful geocode. We require
 *  city + district + (neighborhood or street) — anything less is too
 *  ambiguous for Google to return a useful pin. */
export function hasGeocodableShape(parts: AddressParts): boolean {
  const city = trim(parts.city);
  const district = trim(parts.district);
  const neighborhood = trim(parts.neighborhood);
  const street = trim(parts.street);
  return Boolean(city) && Boolean(district) && (Boolean(neighborhood) || Boolean(street));
}
