/**
 * Server-side wrapper around a single Google Routes API (`computeRoutes`)
 * request. One call always means one origin, up to 25 intermediates, and one
 * destination — that 25-intermediate cap is real and enforced by Google, not
 * a limit this app chose (an earlier version of this comment claimed 98,
 * which was the *Routes Preferred* API's limit, a different enterprise
 * product at a different endpoint — not this one). A day with more than 25
 * stops is split into multiple chunked calls to this function by the
 * application layer; see application/get-day-route.ts and
 * domain/chunk-waypoints.ts.
 *
 * Request/response shaping lives in ./google-directions.mapper (pure, tested).
 */
import "server-only";

import { DirectionsApiError } from "@/features/routing/domain/route.errors";
import {
  buildComputeRoutesBody,
  COMPUTE_ROUTES_FIELD_MASK,
  computeRoutesResponseSchema,
  mapComputeRoutesResponse,
  routesErrorSchema,
  type DirectionsRequest,
  type DirectionsResult,
} from "@/features/routing/infrastructure/google-directions.mapper";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

export type { DirectionsRequest, DirectionsResult };

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
// Larger optimized routes (up to 98 stops) can take a few seconds to solve.
const TIMEOUT_MS = 15_000;

// ---- Directions result cache ---------------------------------------------
//
// The route geometry depends only on origin + destination + waypoint coords.
// Content changes on an order (notes, payment, quantity) move no pin, so a
// live refresh re-requests the SAME geometry — caching it keeps those refreshes
// free (CLAUDE.md §8: don't re-hit a paid Maps API when the answer can't have
// changed) and keeps the optimized order stable so the route never reshuffles
// mid-drive. A real geometry change (added / moved / removed stop) changes the
// key → cache miss → fresh optimize. TTL bounds staleness and re-validates.
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 50;
const directionsCache = new Map<
  string,
  { value: DirectionsResult; expires: number }
>();

function directionsCacheKey(request: DirectionsRequest): string {
  const c = (p: { lat: number; lng: number }) =>
    `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  return [
    c(request.origin),
    c(request.destination),
    ...request.waypoints.map(c),
  ].join("|");
}

/**
 * Cached entry point. Returns a memoized optimize result when the geometry
 * inputs are unchanged; otherwise fetches fresh and stores the success.
 */
export async function callGoogleDirections(
  request: DirectionsRequest,
): Promise<Result<DirectionsResult, DirectionsApiError>> {
  const cacheKey = directionsCacheKey(request);
  const hit = directionsCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) {
    logger.info(
      { waypoints: request.waypoints.length },
      "directions_cache_hit",
    );
    return ok(hit.value);
  }
  if (hit) directionsCache.delete(cacheKey);

  const res = await fetchDirectionsUncached(request);
  if (res.ok) {
    if (directionsCache.size >= CACHE_MAX) {
      const oldest = directionsCache.keys().next().value;
      if (oldest !== undefined) directionsCache.delete(oldest);
    }
    directionsCache.set(cacheKey, {
      value: res.value,
      expires: Date.now() + CACHE_TTL_MS,
    });
  }
  return res;
}

async function fetchDirectionsUncached(
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  let response: Response;
  let parsedJson: unknown;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": COMPUTE_ROUTES_FIELD_MASK,
      },
      body: JSON.stringify(buildComputeRoutesBody(request)),
    });
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

  // Routes API signals failure with an HTTP error status + an `{ error }`
  // envelope (e.g. PERMISSION_DENIED when the Routes API isn't enabled).
  if (!response.ok) {
    const envelope = routesErrorSchema.safeParse(parsedJson);
    const googleStatus = envelope.success
      ? (envelope.data.error.status ?? `HTTP_${response.status}`)
      : `HTTP_${response.status}`;
    const errorMessage = envelope.success
      ? envelope.data.error.message
      : undefined;
    logger.error(
      { httpStatus: response.status, googleStatus, elapsedMs },
      "directions_http_error",
    );
    return err(
      new DirectionsApiError({
        googleStatus,
        ...(errorMessage !== undefined ? { errorMessage } : {}),
      }),
    );
  }

  const parsed = computeRoutesResponseSchema.safeParse(parsedJson);
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

  logger.info(
    {
      waypoints: request.waypoints.length,
      routes: parsed.data.routes.length,
      elapsedMs,
    },
    "directions_called",
  );

  const result = mapComputeRoutesResponse(parsed.data);
  if (!result) {
    return err(
      new DirectionsApiError({
        googleStatus: "NO_ROUTE_RETURNED",
        errorMessage: "Routes API returned 200 with zero routes.",
      }),
    );
  }

  return ok(result);
}
