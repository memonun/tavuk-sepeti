/**
 * Haversine distance — great-circle meters between two lat/lng points.
 *
 * Pure math, no Google geometry library dependency, so it runs cheaply
 * on every geolocation tick (every 1-2s on a moving phone) without
 * waiting for the Maps script to load.
 *
 * Earth-radius constant uses the mean (R = 6,371,000 m). For routing-
 * scale distances (≤ 20km) the spheroid vs sphere error is < 0.3% —
 * well below the GPS accuracy floor (~5m on a phone).
 */

const EARTH_RADIUS_M = 6_371_000;

const toRad = (degrees: number): number => (degrees * Math.PI) / 180;

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
