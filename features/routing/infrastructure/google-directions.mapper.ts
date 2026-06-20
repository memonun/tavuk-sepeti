/**
 * Pure request/response mapping for the Google Routes API (`computeRoutes`).
 *
 * Kept free of `server-only`, `env`, and `fetch` so the boundary parsing and
 * the optimize-result mapping can be unit-tested with a mocked Google response
 * (CLAUDE.md §11). The network wrapper (./google-directions) composes these.
 *
 * Why Routes API instead of the legacy Directions API: the legacy endpoint
 * caps waypoint optimization at 25 stops. `computeRoutes` with
 * `optimizeWaypointOrder` supports up to 98 stops when every point is a
 * lat/lng coordinate (which we always send) — see ./google-directions for the
 * cap. Durations arrive as protobuf strings ("75s"); distances/durations equal
 * to zero are omitted by proto3, so both default to 0 here.
 */
import { z } from "zod";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DirectionsRequest {
  origin: LatLng;
  destination: LatLng;
  waypoints: ReadonlyArray<LatLng>;
}

export interface DirectionsResult {
  /** Indices into `waypoints` in the optimized visit order. */
  waypointOrder: number[];
  /** Simplified overview polyline (origin → ... → destination). Kept as a
   *  fallback for low-zoom views; high-fidelity rendering uses stepPolylines. */
  overviewPolyline: string;
  /** Flat list of every leg's every step's encoded polyline, in route order.
   *  Decode each, concatenate the LatLng arrays, render as a single Polyline
   *  for road-level fidelity (no corner-cutting at street zoom). */
  stepPolylines: string[];
  /** legs[i] is the segment from stop i to stop i+1 (origin = stop 0). */
  legs: Array<{ distanceM: number; durationS: number }>;
}

/**
 * Response fields we consume. `routes.legs.steps.polyline` gives road-level
 * geometry; `optimizedIntermediateWaypointIndex` is the reordered visit order.
 */
export const COMPUTE_ROUTES_FIELD_MASK = [
  "routes.optimizedIntermediateWaypointIndex",
  "routes.polyline.encodedPolyline",
  "routes.legs.distanceMeters",
  "routes.legs.duration",
  "routes.legs.steps.polyline.encodedPolyline",
].join(",");

/**
 * Build the `computeRoutes` POST body. Intermediates default to `stopover`
 * type (required for `optimizeWaypointOrder`); a direct origin → destination
 * route (no waypoints) omits both the intermediates and the optimize flag.
 */
export function buildComputeRoutesBody(
  request: DirectionsRequest,
): Record<string, unknown> {
  const point = (c: LatLng) => ({
    location: { latLng: { latitude: c.lat, longitude: c.lng } },
  });

  return {
    origin: point(request.origin),
    destination: point(request.destination),
    ...(request.waypoints.length > 0
      ? {
          intermediates: request.waypoints.map(point),
          optimizeWaypointOrder: true,
        }
      : {}),
    travelMode: "DRIVE",
    polylineQuality: "HIGH_QUALITY",
    polylineEncoding: "ENCODED_POLYLINE",
    languageCode: "tr",
    regionCode: "TR",
  };
}

// ---- Wire schema (subset we consume) -------------------------------------

const encodedPolylineSchema = z.object({ encodedPolyline: z.string() });

const routesStepSchema = z.object({
  // Defensive: a step missing geometry is dropped rather than failing the parse.
  polyline: encodedPolylineSchema.optional(),
});

const routesLegSchema = z.object({
  // proto3 omits zero-valued scalars, so both fields are optional → 0.
  distanceMeters: z.number().optional(),
  duration: z.string().optional(),
  steps: z.array(routesStepSchema).default([]),
});

const computeRoutesRouteSchema = z.object({
  optimizedIntermediateWaypointIndex: z
    .array(z.number().int().nonnegative())
    .default([]),
  polyline: encodedPolylineSchema.optional(),
  legs: z.array(routesLegSchema).default([]),
});

export const computeRoutesResponseSchema = z.object({
  routes: z.array(computeRoutesRouteSchema).default([]),
});

/** Routes API error envelope (HTTP-status failures carry this body). */
export const routesErrorSchema = z.object({
  error: z.object({
    code: z.number().optional(),
    message: z.string().optional(),
    status: z.string().optional(),
  }),
});

export type ComputeRoutesResponse = z.infer<typeof computeRoutesResponseSchema>;

/**
 * Parse a protobuf Duration string ("75s", "75.4s") to whole seconds.
 * An omitted value (zero-second leg) maps to 0.
 */
export function parseDurationSeconds(value: string | undefined): number {
  if (!value) return 0;
  const raw = value.endsWith("s") ? value.slice(0, -1) : value;
  const seconds = Number.parseFloat(raw);
  return Number.isFinite(seconds) ? Math.round(seconds) : 0;
}

/**
 * Map a parsed `computeRoutes` response onto our DirectionsResult. Returns null
 * when the API succeeded (HTTP 200) but produced zero routes.
 */
export function mapComputeRoutesResponse(
  data: ComputeRoutesResponse,
): DirectionsResult | null {
  const route = data.routes[0];
  if (!route) return null;

  const stepPolylines: string[] = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      if (step.polyline) stepPolylines.push(step.polyline.encodedPolyline);
    }
  }

  return {
    waypointOrder: route.optimizedIntermediateWaypointIndex,
    overviewPolyline: route.polyline?.encodedPolyline ?? "",
    stepPolylines,
    legs: route.legs.map((leg) => ({
      distanceM: leg.distanceMeters ?? 0,
      durationS: parseDurationSeconds(leg.duration),
    })),
  };
}
