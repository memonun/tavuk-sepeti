/**
 * Build a Google Maps "get directions" URL for an already-optimized route,
 * so the driver can open the exact same stop order in the Google Maps app
 * on their phone (turn-by-turn nav, live traffic — things our own map view
 * doesn't do).
 *
 * Uses Google's documented cross-platform URL scheme
 * (https://developers.google.com/maps/documentation/urls/get-started#directions-action):
 * no API key required, opens the native app on mobile when installed and
 * falls back to Maps on the web otherwise.
 */
import type { OptimizedRoute } from "@/features/routing/domain/route";

const coord = (p: { readonly lat: number; readonly lng: number }): string =>
  `${p.lat},${p.lng}`;

export function buildGoogleMapsDirectionsUrl(route: OptimizedRoute): string {
  const destination = route.destination ?? route.origin;
  // A "kind: order" destination is already the last entry in route.stops
  // (see route-destination.ts) — drop it here so it isn't sent twice, once
  // as a waypoint and once as the destination.
  const waypointStops =
    route.destination?.kind === "order" ? route.stops.slice(0, -1) : route.stops;

  const params = new URLSearchParams({
    api: "1",
    origin: coord(route.origin),
    destination: coord(destination),
    travelmode: "driving",
  });
  if (waypointStops.length > 0) {
    params.set("waypoints", waypointStops.map(coord).join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
