/**
 * Server-side wrapper around Google Geocoding API.
 *
 * - Reads GOOGLE_MAPS_SERVER_KEY at call time. The env var is optional in
 *   Sprint 1; this throws a typed error if absent so callers (Server Actions)
 *   can surface a clean message rather than a generic crash.
 * - 5s request timeout via AbortController. Google routinely returns < 1s
 *   for TR addresses; the timeout caps user-perceived latency under bad
 *   network conditions.
 * - Parses Google's JSON with a strict Zod schema at the boundary so every
 *   downstream type is checked, not assumed.
 * - Returns Result<T, E> — every failure mode is a typed AppError subclass.
 */
import "server-only";

import { z } from "zod";

import {
  GeocodingApiError,
  GeocodingQuotaExceededError,
  GeocodingZeroResultsError,
} from "@/features/geocoding/domain/geocoding.errors";
import { mapGoogleAccuracy } from "@/shared/geo/accuracy";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

import type { CoordinateAccuracy } from "@/shared/geo/coordinate";
import type { GoogleRestAddressComponentLike } from "@/shared/geo/tr-address-components";

// ---- Wire response schema -------------------------------------------------
// Only the fields we consume — Google sends much more, we discard via Zod's
// default-strip. `passthrough()` is deliberately not used: shape drift in
// upstream is something we want to detect, not silently absorb.

const googleStatusSchema = z.enum([
  "OK",
  "ZERO_RESULTS",
  "OVER_QUERY_LIMIT",
  "REQUEST_DENIED",
  "INVALID_REQUEST",
  "UNKNOWN_ERROR",
]);

// `address_components` is only consumed by the REVERSE path (coordinate →
// structured fields); the forward path takes the coordinate and ignores it.
// Optional with a default so a forward response that omits it still parses.
const googleAddressComponentSchema = z.object({
  types: z.array(z.string()).default([]),
  long_name: z.string().optional(),
});

const googleResultSchema = z.object({
  formatted_address: z.string(),
  geometry: z.object({
    location: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
    location_type: z.string().optional(),
  }),
  address_components: z.array(googleAddressComponentSchema).default([]),
});

const googleResponseSchema = z.object({
  status: googleStatusSchema,
  results: z.array(googleResultSchema).default([]),
  error_message: z.string().optional(),
});

// ---- Public API -----------------------------------------------------------

export interface GeocodeResponse {
  lat: number;
  lng: number;
  accuracy: CoordinateAccuracy;
  formattedAddress: string;
  /** Structured components of the first result. Empty on the forward path,
   *  which only wants the coordinate; the reverse path maps these into the
   *  TR address fields. */
  addressComponents: readonly GoogleRestAddressComponentLike[];
  /** Full Google payload — persisted in geocoding_cache.raw_response so we
   *  can re-derive accuracy if our mapping logic changes. */
  rawResponse: unknown;
}

export type GeocodeFailure =
  | GeocodingZeroResultsError
  | GeocodingQuotaExceededError
  | GeocodingApiError;

export interface CallGoogleResult {
  result: Result<GeocodeResponse, GeocodeFailure>;
  /** Wall-clock time of the network call, for the api_calls audit log. */
  responseTimeMs: number;
  googleStatus: string;
}

const ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";
const TIMEOUT_MS = 5_000;

/**
 * Single Google Geocoding call with timeout. Caller is responsible for cache
 * lookup and quota accounting — this function is a pure I/O primitive.
 */
export async function callGoogleGeocoder(
  rawAddress: string,
): Promise<CallGoogleResult> {
  return callGeocodeEndpoint({ address: rawAddress }, rawAddress);
}

/**
 * Reverse geocode: coordinate → structured address. Same endpoint, same
 * timeout/quota/error contract as the forward call; only the query parameter
 * differs (`latlng` instead of `address`).
 */
export async function callGoogleReverseGeocoder(
  lat: number,
  lng: number,
): Promise<CallGoogleResult> {
  const latlng = `${lat},${lng}`;
  return callGeocodeEndpoint({ latlng }, latlng);
}

/**
 * Shared transport for both directions. `inputLabel` is only used to describe
 * the input in a ZERO_RESULTS error — it never reaches Google.
 */
async function callGeocodeEndpoint(
  params: Readonly<Record<string, string>>,
  inputLabel: string,
): Promise<CallGoogleResult> {
  const key = env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    return {
      result: err(
        new GeocodingApiError({
          googleStatus: "MISSING_API_KEY",
          errorMessage: "GOOGLE_MAPS_SERVER_KEY is not set in env.",
        }),
      ),
      responseTimeMs: 0,
      googleStatus: "MISSING_API_KEY",
    };
  }

  const url = new URL(ENDPOINT);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  url.searchParams.set("key", key);
  url.searchParams.set("language", "tr");
  url.searchParams.set("region", "tr");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  let parsedJson: unknown;
  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    parsedJson = await response.json();
  } catch (e) {
    const responseTimeMs = Date.now() - startedAt;
    const isAbort = e instanceof Error && e.name === "AbortError";
    const status = isAbort ? "TIMEOUT" : "FETCH_ERROR";
    logger.warn({ status, responseTimeMs }, "geocode_call_failed");
    return {
      result: err(
        new GeocodingApiError({
          googleStatus: status,
          errorMessage: e instanceof Error ? e.message : "Unknown fetch error",
        }),
      ),
      responseTimeMs,
      googleStatus: status,
    };
  } finally {
    clearTimeout(timeoutId);
  }

  const responseTimeMs = Date.now() - startedAt;

  const parsed = googleResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues }, "geocode_response_shape_invalid");
    return {
      result: err(
        new GeocodingApiError({
          googleStatus: "RESPONSE_SHAPE_INVALID",
          errorMessage: "Google response shape did not match expected schema.",
        }),
      ),
      responseTimeMs,
      googleStatus: "RESPONSE_SHAPE_INVALID",
    };
  }

  const data = parsed.data;
  logger.info(
    { status: data.status, resultsCount: data.results.length, responseTimeMs },
    "geocode_called",
  );

  switch (data.status) {
    case "OK": {
      const first = data.results[0];
      if (!first) {
        return {
          result: err(new GeocodingZeroResultsError({ input: inputLabel })),
          responseTimeMs,
          googleStatus: data.status,
        };
      }
      return {
        result: ok({
          lat: first.geometry.location.lat,
          lng: first.geometry.location.lng,
          accuracy: mapGoogleAccuracy(first.geometry.location_type),
          formattedAddress: first.formatted_address,
          addressComponents: first.address_components,
          rawResponse: data,
        }),
        responseTimeMs,
        googleStatus: data.status,
      };
    }
    case "ZERO_RESULTS":
      return {
        result: err(new GeocodingZeroResultsError({ input: inputLabel })),
        responseTimeMs,
        googleStatus: data.status,
      };
    case "OVER_QUERY_LIMIT":
      return {
        result: err(
          new GeocodingQuotaExceededError({ reason: "google_over_query_limit" }),
        ),
        responseTimeMs,
        googleStatus: data.status,
      };
    case "REQUEST_DENIED":
    case "INVALID_REQUEST":
    case "UNKNOWN_ERROR":
      return {
        result: err(
          new GeocodingApiError({
            googleStatus: data.status,
            ...(data.error_message !== undefined
              ? { errorMessage: data.error_message }
              : {}),
          }),
        ),
        responseTimeMs,
        googleStatus: data.status,
      };
  }
}
