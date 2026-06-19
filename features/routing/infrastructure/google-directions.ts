/**
 * Server-side wrapper around the Google Directions API.
 *
 * Builds a single round-trip request (origin = destination = warehouse,
 * waypoints = orders) with `optimize:true`, parses the response with Zod
 * at the boundary, returns the optimization output for the caller to
 * map onto the order list.
 *
 * Faz 1 caps at 25 waypoints (Google's standard plan limit). The
 * application layer enforces; this wrapper trusts the caller.
 */
import "server-only";

import { z } from "zod";

import { DirectionsApiError } from "@/features/routing/domain/route.errors";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

const ENDPOINT = "https://maps.googleapis.com/maps/api/directions/json";
const TIMEOUT_MS = 10_000;

// ---- Wire schema (subset we consume) -------------------------------------

// Each step's polyline.points is a per-segment encoded polyline that follows
// the road exactly. The route's overview_polyline is a simplified summary
// that visibly cuts corners at high zoom — we use the steps for rendering.
const directionsStepSchema = z.object({
  polyline: z.object({ points: z.string() }),
});

const directionsLegSchema = z.object({
  distance: z.object({ value: z.number() }),
  duration: z.object({ value: z.number() }),
  steps: z.array(directionsStepSchema).default([]),
});

const directionsRouteSchema = z.object({
  waypoint_order: z.array(z.number().int().nonnegative()),
  overview_polyline: z.object({ points: z.string() }),
  legs: z.array(directionsLegSchema),
});

const directionsResponseSchema = z.object({
  status: z.enum([
    "OK",
    "NOT_FOUND",
    "ZERO_RESULTS",
    "MAX_WAYPOINTS_EXCEEDED",
    "MAX_ROUTE_LENGTH_EXCEEDED",
    "INVALID_REQUEST",
    "OVER_DAILY_LIMIT",
    "OVER_QUERY_LIMIT",
    "REQUEST_DENIED",
    "UNKNOWN_ERROR",
  ]),
  routes: z.array(directionsRouteSchema).default([]),
  error_message: z.string().optional(),
});

// ---- Public API ----------------------------------------------------------

export interface DirectionsRequest {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  waypoints: ReadonlyArray<{ lat: number; lng: number }>;
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

export async function callGoogleDirections(
  request: DirectionsRequest,
): Promise<Result<DirectionsResult, DirectionsApiError>> {
  const key = env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    return err(
      new DirectionsApiError({
        googleStatus: "MISSING_API_KEY",
        errorMessage: "GOOGLE_MAPS_SERVER_KEY env is not set.",
      }),
    );
  }

  const formatCoord = (c: { lat: number; lng: number }) => `${c.lat},${c.lng}`;
  const url = new URL(ENDPOINT);
  url.searchParams.set("origin", formatCoord(request.origin));
  url.searchParams.set("destination", formatCoord(request.destination));
  // Waypoints are optional: a direct origin → destination route (e.g. the only
  // order is the chosen end point) has zero waypoints, so omit the param.
  if (request.waypoints.length > 0) {
    url.searchParams.set(
      "waypoints",
      `optimize:true|${request.waypoints.map(formatCoord).join("|")}`,
    );
  }
  url.searchParams.set("mode", "driving");
  url.searchParams.set("region", "tr");
  url.searchParams.set("language", "tr");
  url.searchParams.set("key", key);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  let parsedJson: unknown;
  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    parsedJson = await response.json();
  } catch (e) {
    const isAbort = e instanceof Error && e.name === "AbortError";
    return err(
      new DirectionsApiError({
        googleStatus: isAbort ? "TIMEOUT" : "FETCH_ERROR",
        errorMessage: e instanceof Error ? e.message : "Unknown fetch error",
      }),
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const elapsedMs = Date.now() - startedAt;

  const parsed = directionsResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    logger.error(
      { issues: parsed.error.issues, elapsedMs },
      "directions_response_shape_invalid",
    );
    return err(
      new DirectionsApiError({
        googleStatus: "RESPONSE_SHAPE_INVALID",
        errorMessage: "Google response shape did not match expected schema.",
      }),
    );
  }

  const data = parsed.data;
  logger.info(
    { status: data.status, waypoints: request.waypoints.length, elapsedMs },
    "directions_called",
  );

  if (data.status !== "OK") {
    return err(
      new DirectionsApiError({
        googleStatus: data.status,
        ...(data.error_message !== undefined
          ? { errorMessage: data.error_message }
          : {}),
      }),
    );
  }

  const route = data.routes[0];
  if (!route) {
    return err(
      new DirectionsApiError({
        googleStatus: "NO_ROUTE_RETURNED",
        errorMessage: "Google returned status OK with zero routes.",
      }),
    );
  }

  // Flatten leg.steps[*].polyline.points across all legs in route order.
  const stepPolylines: string[] = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      stepPolylines.push(step.polyline.points);
    }
  }

  return ok({
    waypointOrder: route.waypoint_order,
    overviewPolyline: route.overview_polyline.points,
    stepPolylines,
    legs: route.legs.map((leg) => ({
      distanceM: leg.distance.value,
      durationS: leg.duration.value,
    })),
  });
}
