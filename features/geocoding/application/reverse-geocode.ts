/**
 * Reverse geocode a coordinate into TR address fields.
 *
 * The mirror of `geocode-address.ts`, and deliberately the same shape:
 *
 *   1. Quantize the coordinate into a stable cache key.
 *   2. Cache lookup — on hit, bump hit_count and re-derive the fields.
 *   3. Quota check — refuse once today's calls hit GEOCODING_DAILY_LIMIT.
 *   4. Call Google; log the call regardless of outcome.
 *   5. On success, upsert cache; return the parsed address.
 *
 * Why it goes through the cache at all: this runs on every pin drop, and a
 * customer nudging the pin a few times would otherwise bill a call per nudge
 * (CLAUDE.md §8 — a Google call that is not cached needs a reason, and there
 * isn't one here). The 5-decimal key means re-dropping the pin on the same
 * doorstep is free, while a genuinely different door still asks Google.
 *
 * The cache table stores no parsed fields, only `raw_response`. That is enough:
 * the components are re-read from the stored payload through the same mapper
 * the live path uses, so a cache hit and a fresh call cannot disagree — and
 * improving the TR mapping later retroactively improves cached rows.
 */
import "server-only";

import { z } from "zod";

import {
  GeocodingQuotaExceededError,
  GeocodingZeroResultsError,
  type GeocodingApiError,
} from "@/features/geocoding/domain/geocoding.errors";
import { coordinateCacheKey } from "@/features/geocoding/domain/normalize-coordinate";
import { computeInputHash } from "@/features/geocoding/infrastructure/hash";
import { callGoogleReverseGeocoder } from "@/features/geocoding/infrastructure/google-geocoder";
import {
  countTodayCalls,
  logApiCall,
} from "@/features/geocoding/infrastructure/geocoding-api-calls.repository";
import {
  bumpCacheHit,
  findCacheEntry,
  upsertCacheEntry,
} from "@/features/geocoding/infrastructure/geocoding-cache.repository";
import {
  fromRestAddressComponents,
  mapGooglePlaceComponents,
} from "@/shared/geo/tr-address-components";
import type { ExternalApiError } from "@/shared/errors/app-error";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";
import { err, isErr, ok, type Result } from "@/shared/result";

import type { CoordinateAccuracy } from "@/shared/geo/coordinate";
import type { ParsedAddress } from "@/shared/geo/tr-address-components";

export type ReverseGeocodeFailure =
  | GeocodingZeroResultsError
  | GeocodingQuotaExceededError
  | GeocodingApiError
  | ExternalApiError;

export interface ReverseGeocodeResult {
  /** Structured fields. `lat`/`lng` are the caller's own point, not Google's
   *  snapped one — the customer put the pin where they meant it. */
  address: ParsedAddress;
  /** How precise Google considers the address AT that point. Surfaced so the
   *  UI can say "yaklaşık" instead of implying the fields are authoritative. */
  accuracy: CoordinateAccuracy;
}

/** Shape of the cached Google payload we re-read components from. */
const cachedPayloadSchema = z.object({
  results: z
    .array(
      z.object({
        address_components: z
          .array(
            z.object({
              types: z.array(z.string()).default([]),
              long_name: z.string().optional(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<Result<ReverseGeocodeResult, ReverseGeocodeFailure>> {
  const key = coordinateCacheKey(lat, lng);
  if (!key) {
    return err(new GeocodingZeroResultsError({ input: `${lat},${lng}` }));
  }

  const inputHash = await computeInputHash(key);

  // ---- 1. Cache lookup ---------------------------------------------------
  const cacheLookup = await findCacheEntry(inputHash);
  if (isErr(cacheLookup)) return cacheLookup;

  if (cacheLookup.value) {
    const cached = cachedPayloadSchema.safeParse(cacheLookup.value.rawResponse);
    const components = cached.success
      ? cached.data.results[0]?.address_components
      : undefined;

    // A row whose payload no longer parses is treated as a miss rather than a
    // hard failure — shape drift must not strand the customer on a stale row.
    if (components) {
      void bumpCacheHit(inputHash);
      logger.debug({ inputHash }, "reverse_geocode_cache_hit");
      return ok({
        address: {
          ...mapGooglePlaceComponents(fromRestAddressComponents(components), {
            lat,
            lng,
          }),
        },
        accuracy: cacheLookup.value.accuracy,
      });
    }
    logger.warn({ inputHash }, "reverse_geocode_cache_payload_unreadable");
  }

  // ---- 2. Quota check ----------------------------------------------------
  const limit = env.GEOCODING_DAILY_LIMIT;
  const used = await countTodayCalls();
  if (used >= limit) {
    logger.warn({ used, limit }, "reverse_geocode_daily_limit_reached");
    return err(new GeocodingQuotaExceededError({ reason: "daily_limit" }));
  }
  if (used >= Math.floor(limit * 0.8)) {
    logger.warn({ used, limit }, "reverse_geocode_quota_warning_80pct");
  }

  // ---- 3. Call Google ----------------------------------------------------
  const { result, responseTimeMs, googleStatus } = await callGoogleReverseGeocoder(
    lat,
    lng,
  );

  // 4. Log the call regardless of outcome.
  void logApiCall({ status: googleStatus, responseTimeMs, inputHash });

  if (isErr(result)) return result;

  // ---- 5. Cache + return -------------------------------------------------
  const upsert = await upsertCacheEntry({
    inputHash,
    inputNormalized: key,
    // The customer's point is what we key on and what the form keeps, so store
    // that rather than Google's snapped coordinate — otherwise a cache hit
    // would hand back a location the customer never chose.
    lat,
    lng,
    accuracy: result.value.accuracy,
    rawResponse: result.value.rawResponse,
  });
  if (isErr(upsert)) {
    logger.warn({ inputHash }, "reverse_geocode_cache_upsert_failed_continuing");
  }

  return ok({
    address: mapGooglePlaceComponents(
      fromRestAddressComponents(result.value.addressComponents),
      { lat, lng },
    ),
    accuracy: result.value.accuracy,
  });
}
