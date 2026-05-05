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

const directionsLegSchema = z.object({
  distance: z.object({ value: z.number() }),
  duration: z.object({ value: z.number() }),
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
  /** Encoded polyline for the full route (origin → ... → destination). */
  overviewPolyline: string;
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

  if (request.waypoints.length === 0) {
    return err(
      new DirectionsApiError({
        googleStatus: "EMPTY_WAYPOINTS",
        errorMessage: "Waypoints must include at least one stop.",
      }),
    );
  }

  const formatCoord = (c: { lat: number; lng: number }) => `${c.lat},${c.lng}`;
  const url = new URL(ENDPOINT);
  url.searchParams.set("origin", formatCoord(request.origin));
  url.searchParams.set("destination", formatCoord(request.destination));
  url.searchParams.set(
    "waypoints",
    `optimize:true|${request.waypoints.map(formatCoord).join("|")}`,
  );
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

  return ok({
    waypointOrder: route.waypoint_order,
    overviewPolyline: route.overview_polyline.points,
    legs: route.legs.map((leg) => ({
      distanceM: leg.distance.value,
      durationS: leg.duration.value,
    })),
  });
}
