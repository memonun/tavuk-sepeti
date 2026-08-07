/**
 * Google Places address components → Türkiye's structured address fields.
 *
 * Lifted out of `address-autocomplete.tsx`, where it was inline and therefore
 * untestable. It is pure data mapping with no Google SDK dependency: the input
 * is described structurally so the same function serves the admin customer form,
 * the storefront checkout, and unit tests.
 *
 * The TR mapping is not one-to-one with Google's taxonomy:
 *   il      ← administrative_area_level_1
 *   ilçe    ← administrative_area_level_2
 *   mahalle ← administrative_area_level_4, else neighborhood, else
 *             sublocality_level_1, else sublocality_level_2
 *             (Google is inconsistent about which one carries the mahalle,
 *              and a missing mahalle costs us a geocodable address — so all
 *              four are tried in descending specificity.)
 *   cadde   ← route
 *   bina no ← street_number
 */

/** The shape we need from `google.maps.places.AddressComponent`. */
export interface GoogleAddressComponentLike {
  readonly types: readonly string[];
  readonly longText: string | null;
}

/**
 * The same component as the REST Geocoding API spells it (`long_name`), which
 * is what the server-side reverse geocode receives. Google uses two different
 * casings for one concept across its two APIs; normalising here keeps the TR
 * mapping below single-source instead of forked per caller.
 */
export interface GoogleRestAddressComponentLike {
  readonly types: readonly string[];
  // `| undefined` is explicit because `exactOptionalPropertyTypes` is on and
  // Zod's `.optional()` produces exactly that.
  readonly long_name?: string | null | undefined;
}

/** REST (`long_name`) → Places JS (`longText`) component shape. */
export function fromRestAddressComponents(
  components: readonly GoogleRestAddressComponentLike[],
): GoogleAddressComponentLike[] {
  return components.map((c) => ({
    types: c.types,
    longText: c.long_name ?? null,
  }));
}

/** Structured TR address as the forms hold it. Coordinates are (0,0) when the
 *  place carried no location — `delivery-readiness` treats that as "no pin". */
export interface ParsedAddress {
  city: string;
  district: string;
  neighborhood: string;
  street: string;
  building_no: string;
  postal_code: string;
  lat: number;
  lng: number;
}

/** Mahalle fallback chain, most specific first. */
const NEIGHBORHOOD_TYPES = [
  "administrative_area_level_4",
  "neighborhood",
  "sublocality_level_1",
  "sublocality_level_2",
] as const;

export function mapGooglePlaceComponents(
  components: readonly GoogleAddressComponentLike[],
  location: { readonly lat: number; readonly lng: number } | null | undefined,
): ParsedAddress {
  const long = (type: string): string =>
    components.find((c) => c.types.includes(type))?.longText ?? "";

  let neighborhood = "";
  for (const type of NEIGHBORHOOD_TYPES) {
    neighborhood = long(type);
    if (neighborhood !== "") break;
  }

  return {
    city: long("administrative_area_level_1"),
    district: long("administrative_area_level_2"),
    neighborhood,
    street: long("route"),
    building_no: long("street_number"),
    postal_code: long("postal_code"),
    lat: location?.lat ?? 0,
    lng: location?.lng ?? 0,
  };
}
