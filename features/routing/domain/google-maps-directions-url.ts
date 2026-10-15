/**
 * Build Google Maps "get directions" URLs for an already-optimized route,
 * so the driver can open the exact same stop order in the Google Maps app
 * on their phone (turn-by-turn nav, live traffic — things our own map view
 * doesn't do).
 *
 * Uses Google's documented cross-platform URL scheme
 * (https://developers.google.com/maps/documentation/urls/get-started#directions-action):
 * no API key required, opens the native app on mobile when installed and
 * falls back to Maps on the web otherwise.
 *
 * That scheme accepts at most 9 waypoints — anything beyond is silently
 * dropped, so a 21-stop route only showed the first 9 stops. Longer routes
 * are split into consecutive legs (each leg starts where the previous one
 * ended), balanced so no leg is a near-empty tail.
 */
import type { OptimizedRoute } from "@/features/routing/domain/route";

/** Google Maps URL limit on intermediate waypoints (origin/destination excluded). */
export const GOOGLE_MAPS_MAX_WAYPOINTS = 9;

type Point = { readonly lat: number; readonly lng: number };

export interface GoogleMapsLeg {
  readonly url: string;
  /** 1-based number of the first route stop this leg drives to. Null when the
   *  leg reaches no stop (a route with zero stops: origin → destination). */
  readonly firstStop: number | null;
  /** 1-based number of the last route stop this leg drives to. */
  readonly lastStop: number | null;
  /** True when the leg ends at the route's end point (origin or a fixed
   *  location) rather than at a stop. */
  readonly endsAtRouteEnd: boolean;
}

const coord = (p: Point): string => `${p.lat},${p.lng}`;

function directionsUrl(points: readonly Point[]): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) throw new Error("directionsUrl needs at least 2 points");
  const waypoints = points.slice(1, -1);

  const params = new URLSearchParams({
    api: "1",
    origin: coord(first),
    destination: coord(last),
    travelmode: "driving",
  });
  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.map(coord).join("|"));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildGoogleMapsDirectionsLegs(
  route: OptimizedRoute,
): readonly GoogleMapsLeg[] {
  // A "kind: order" destination is already the last entry in route.stops
  // (see route-destination.ts) — the path then simply ends at that stop.
  // Otherwise the path ends at a separate point (the origin for a round trip).
  const endsAtStop = route.destination?.kind === "order" && route.stops.length > 0;
  const stopCount = route.stops.length;
  const points: Point[] = [route.origin, ...route.stops];
  if (!endsAtStop) points.push(route.destination ?? route.origin);

  // Each leg spans at most GOOGLE_MAPS_MAX_WAYPOINTS + 1 segments.
  const segments = points.length - 1;
  const maxSegmentsPerLeg = GOOGLE_MAPS_MAX_WAYPOINTS + 1;
  const legCount = Math.max(1, Math.ceil(segments / maxSegmentsPerLeg));
  const base = Math.floor(segments / legCount);
  const extra = segments % legCount;

  const legs: GoogleMapsLeg[] = [];
  let start = 0;
  for (let i = 0; i < legCount; i++) {
    const end = start + base + (i < extra ? 1 : 0);
    // points[k] for 1 ≤ k ≤ stopCount is stop number k.
    const firstStop = start + 1 <= stopCount ? start + 1 : null;
    const lastStop = firstStop === null ? null : Math.min(end, stopCount);
    legs.push({
      url: directionsUrl(points.slice(start, end + 1)),
      firstStop,
      lastStop,
      endsAtRouteEnd: end > stopCount,
    });
    start = end;
  }
  return legs;
}
