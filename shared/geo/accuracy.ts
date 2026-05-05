/**
 * Map Google Geocoding API's `location_type` to our domain accuracy enum.
 *
 * Anything Google returns that we don't recognize falls through to `unknown`
 * — domain stays defensive against API drift. The "low accuracy" predicate
 * drives the SPEC.md §6.4 rule: addresses with low accuracy require admin
 * confirmation before save.
 */
import type { CoordinateAccuracy } from "@/shared/geo/coordinate";

const GOOGLE_LOCATION_TYPE: Readonly<Record<string, CoordinateAccuracy>> = {
  ROOFTOP: "rooftop",
  RANGE_INTERPOLATED: "range_interpolated",
  GEOMETRIC_CENTER: "geometric_center",
  APPROXIMATE: "approximate",
};

export function mapGoogleAccuracy(
  googleLocationType: string | null | undefined,
): CoordinateAccuracy {
  if (!googleLocationType) return "unknown";
  return GOOGLE_LOCATION_TYPE[googleLocationType] ?? "unknown";
}

const LOW_ACCURACY: ReadonlySet<CoordinateAccuracy> = new Set([
  "approximate",
  "unknown",
]);

/** True when admin must confirm the pin before save. */
export function isLowAccuracy(accuracy: CoordinateAccuracy): boolean {
  return LOW_ACCURACY.has(accuracy);
}
