/**
 * Orchestrate the full geocoding pipeline.
 *
 * Steps (SPEC.md §6.1):
 *   1. Normalize address text and hash it.
 *   2. Cache lookup — on hit, bump hit_count and return.
 *   3. Quota check — refuse if today's calls >= GEOCODING_DAILY_LIMIT.
 *   4. Call Google Geocoder; log the call regardless of outcome.
 *   5. On success, upsert cache; return Coordinate.
 *
 * Cache and quota-log writes are best-effort (logged + swallowed) — a
 * background-write failure shouldn't block the user-facing geocode call.
 *
 * Returns the auto-geocoded Coordinate. Low accuracy is NOT an error here
 * (the value is still useful for UI preview); the SAVE path checks
 * `isLowAccuracy()` and gates persistence on admin confirmation.
 */
import "server-only";

import {
  GeocodingQuotaExceededError,
  type GeocodingApiError,
  type GeocodingZeroResultsError,
} from "@/features/geocoding/domain/geocoding.errors";
import { normalizeAddress } from "@/features/geocoding/domain/normalize-address";
import { computeInputHash } from "@/features/geocoding/infrastructure/hash";
import { callGoogleGeocoder } from "@/features/geocoding/infrastructure/google-geocoder";
import {
  countTodayCalls,
  logApiCall,
} from "@/features/geocoding/infrastructure/geocoding-api-calls.repository";
import {
  bumpCacheHit,
  findCacheEntry,
  upsertCacheEntry,
} from "@/features/geocoding/infrastructure/geocoding-cache.repository";
import type { ExternalApiError } from "@/shared/errors/app-error";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";
import { err, isErr, ok, type Result } from "@/shared/result";

import type { Coordinate } from "@/shared/geo/coordinate";

export type GeocodeAddressFailure =
  | GeocodingZeroResultsError
  | GeocodingQuotaExceededError
  | GeocodingApiError
  | ExternalApiError;

export async function geocodeAddress(
  rawAddress: string,
): Promise<Result<Coordinate, GeocodeAddressFailure>> {
  const normalized = normalizeAddress(rawAddress);
  if (!normalized) {
    // Empty after normalization — caller (Zod) should have caught it, but
    // we don't trust the boundary alone.
    return err(
      new (await import("@/features/geocoding/domain/geocoding.errors")).GeocodingZeroResultsError(
        { input: rawAddress },
      ),
    );
  }

  const inputHash = await computeInputHash(normalized);

  // ---- 1. Cache lookup ---------------------------------------------------
  const cacheLookup = await findCacheEntry(inputHash);
  if (isErr(cacheLookup)) return cacheLookup;

  if (cacheLookup.value) {
    void bumpCacheHit(inputHash);
    logger.debug({ inputHash }, "geocode_cache_hit");
    return ok({
      lat: cacheLookup.value.lat,
      lng: cacheLookup.value.lng,
      source: "geocoded_auto",
      accuracy: cacheLookup.value.accuracy,
      geocoded_at: new Date(),
      geocoder_response_hash: inputHash,
    });
  }

  // ---- 2. Quota check ----------------------------------------------------
  const limit = env.GEOCODING_DAILY_LIMIT;
  const used = await countTodayCalls();
  if (used >= limit) {
    logger.warn({ used, limit }, "geocode_daily_limit_reached");
    return err(new GeocodingQuotaExceededError({ reason: "daily_limit" }));
  }
  if (used >= Math.floor(limit * 0.8)) {
    logger.warn({ used, limit }, "geocode_quota_warning_80pct");
  }

  // ---- 3. Call Google ----------------------------------------------------
  const { result, responseTimeMs, googleStatus } = await callGoogleGeocoder(rawAddress);

  // 4. Log the call regardless of outcome.
  void logApiCall({ status: googleStatus, responseTimeMs, inputHash });

  if (isErr(result)) return result;

  // ---- 5. Cache + return -------------------------------------------------
  const upsert = await upsertCacheEntry({
    inputHash,
    inputNormalized: normalized,
    lat: result.value.lat,
    lng: result.value.lng,
    accuracy: result.value.accuracy,
    rawResponse: result.value.rawResponse,
  });
  if (isErr(upsert)) {
    logger.warn({ inputHash }, "geocode_cache_upsert_failed_continuing");
  }

  return ok({
    lat: result.value.lat,
    lng: result.value.lng,
    source: "geocoded_auto",
    accuracy: result.value.accuracy,
    geocoded_at: new Date(),
    geocoder_response_hash: inputHash,
  });
}
