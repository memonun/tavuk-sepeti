/**
 * Persistence layer for the geocoding_cache table.
 *
 * Service-role client: cache reads and writes are system operations, not
 * user-scoped. RLS would still allow them since the caller is admin, but
 * the service-role client avoids carrying a session into background flows.
 */
import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";

import type { CoordinateAccuracy } from "@/shared/geo/coordinate";

export interface CachedEntry {
  inputHash: string;
  inputNormalized: string;
  lat: number;
  lng: number;
  accuracy: CoordinateAccuracy;
  rawResponse: unknown;
  hitCount: number;
}

export interface CacheUpsertInput {
  inputHash: string;
  inputNormalized: string;
  lat: number;
  lng: number;
  accuracy: CoordinateAccuracy;
  rawResponse: unknown;
}

export async function findCacheEntry(
  inputHash: string,
): Promise<Result<CachedEntry | null, ExternalApiError>> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("geocoding_cache")
    .select("input_hash, input_normalized, lat, lng, accuracy, raw_response, hit_count")
    .eq("input_hash", inputHash)
    .maybeSingle();

  if (error) {
    logger.error({ code: error.code, message: error.message }, "cache_lookup_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  if (!data) return ok(null);

  return ok({
    inputHash: data.input_hash,
    inputNormalized: data.input_normalized,
    lat: data.lat,
    lng: data.lng,
    accuracy: data.accuracy as CoordinateAccuracy,
    rawResponse: data.raw_response,
    hitCount: data.hit_count,
  });
}

export async function upsertCacheEntry(
  input: CacheUpsertInput,
): Promise<Result<void, ExternalApiError>> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("geocoding_cache").upsert(
    {
      input_hash: input.inputHash,
      input_normalized: input.inputNormalized,
      lat: input.lat,
      lng: input.lng,
      accuracy: input.accuracy,
      raw_response: input.rawResponse as never,
    },
    { onConflict: "input_hash" },
  );
  if (error) {
    logger.error({ code: error.code, message: error.message }, "cache_upsert_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

/**
 * Best-effort hit-count bump. Failures are logged and swallowed — a missed
 * counter shouldn't break the user-facing geocode call.
 */
export async function bumpCacheHit(inputHash: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  // Postgres UPDATE … RETURNING via supabase-js: read current count, write +1.
  // Race-y under concurrent calls but the loss is statistical, not functional.
  const { data, error: readError } = await supabase
    .from("geocoding_cache")
    .select("hit_count")
    .eq("input_hash", inputHash)
    .maybeSingle();
  if (readError || !data) return;

  const { error: writeError } = await supabase
    .from("geocoding_cache")
    .update({ hit_count: data.hit_count + 1, last_seen_at: new Date().toISOString() })
    .eq("input_hash", inputHash);
  if (writeError) {
    logger.warn({ code: writeError.code }, "cache_hit_bump_failed");
  }
}
