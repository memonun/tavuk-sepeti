/**
 * Parses a "lat, lng" pair pasted straight from Google Maps — right-click a
 * point → "Copy coordinates" gives exactly this shape, e.g.
 * "38.35810359793086, 38.32864712115469". Accepts optional whitespace around
 * the comma and a leading "-" on either number.
 *
 * Returns null for anything that isn't a clean two-number pair in valid
 * lat/lng range — callers should leave the existing fields untouched rather
 * than write a partial or out-of-range coordinate.
 */
export function parseCoordinatePair(input: string): { lat: number; lng: number } | null {
  const match = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  const latStr = match?.[1];
  const lngStr = match?.[2];
  if (!latStr || !lngStr) return null;

  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}
