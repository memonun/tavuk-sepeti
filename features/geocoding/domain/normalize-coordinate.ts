/**
 * Cache key for a REVERSE geocode (coordinate → address).
 *
 * The forward pipeline keys its cache on normalized address text. Reverse needs
 * the mirror of that: a stable string for a point. Two things matter.
 *
 * Precision. Coordinates are quantized to 5 decimals (~1.1 m at this latitude).
 * Anything coarser would merge neighbouring doors and hand back the wrong
 * `street_number`, which is the one field a customer would not think to check.
 * Anything finer makes every pixel of a pin drag a distinct key, so the cache
 * would never hit and every nudge would bill a Google call (CLAUDE.md §8).
 *
 * Stability. `toFixed` is applied twice: the first pass rounds, the second
 * collapses the `-0` that a small negative input produces ("-0.00000"), so the
 * same point can never yield two different keys.
 *
 * Prefixed with `@` so a reverse key can never collide with a normalized
 * address string in the shared `geocoding_cache` table.
 */

/** Decimal places kept in the cache key (~1.1 m). */
export const COORDINATE_KEY_PRECISION = 5;

function quantize(value: number): string {
  return Number(value.toFixed(COORDINATE_KEY_PRECISION)).toFixed(
    COORDINATE_KEY_PRECISION,
  );
}

/**
 * Stable cache key for a coordinate. Non-finite input yields an empty string —
 * the caller treats that the way `normalizeAddress` treats empty text, as
 * "nothing to look up".
 */
export function coordinateCacheKey(lat: number, lng: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return "";
  return `@${quantize(lat)},${quantize(lng)}`;
}
