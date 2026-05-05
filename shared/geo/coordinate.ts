/**
 * Coordinate value object — the shape every map pin and geocode result takes.
 *
 * Mirrors the SQL enums from migration 002 deliberately (string literals match
 * the DB columns 1-to-1) so the mapper layer stays trivial. Importing supabase
 * types into the domain would couple us to the DB shape; defining the enums
 * here is the source of truth.
 */

export type CoordinateSource =
  | "geocoded_auto"     // Google Geocoding API, no human edit
  | "geocoded_manual"   // Admin geocoded a candidate from a list of suggestions
  | "user_pin"          // Customer dropped a pin themselves (Faz 2)
  | "admin_corrected";  // Admin moved the pin after auto-geocode

export type CoordinateAccuracy =
  | "rooftop"             // Building-level — best
  | "range_interpolated"  // Interpolated along a street
  | "geometric_center"    // Center of a region
  | "approximate"         // City / district level — needs manual confirmation
  | "unknown";            // Custom pin or unmapped Google value

export interface Coordinate {
  readonly lat: number;
  readonly lng: number;
  readonly source: CoordinateSource;
  readonly accuracy: CoordinateAccuracy;
  readonly geocoded_at: Date | null;
  readonly geocoder_response_hash: string | null;
}
