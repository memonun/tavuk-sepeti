/**
 * Append-only audit log for every Google Geocoding call we make.
 *
 * Drives the daily quota guard: count rows where called_at >= today (TR)
 * before deciding to proceed. Logging failures are swallowed so we never
 * block a user request because telemetry didn't write.
 */
import "server-only";

import { logger } from "@/shared/logger";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";

export interface ApiCallLogEntry {
  status: string;
  responseTimeMs: number;
  inputHash: string | null;
}

export async function logApiCall(entry: ApiCallLogEntry): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("geocoding_api_calls").insert({
    status: entry.status,
    response_time_ms: entry.responseTimeMs,
    input_hash: entry.inputHash,
  });
  if (error) {
    logger.warn({ code: error.code, message: error.message }, "api_call_log_failed");
  }
}

/**
 * Count today's calls (Europe/Istanbul day boundary). Cheap due to the
 * `geocoding_api_calls_called_at_idx` index. Returns 0 on read failure so
 * the quota guard fails open — a logging error shouldn't lock out the admin.
 */
export async function countTodayCalls(): Promise<number> {
  const supabase = getSupabaseAdminClient();

  // "Today, in Europe/Istanbul" — derive the local date, build a UTC range.
  // Postgres can't filter on `(called_at at time zone 'Europe/Istanbul')::date`
  // through PostgREST without a custom RPC, so we compute the range here.
  const now = new Date();
  const tzMidnight = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }),
  );
  tzMidnight.setHours(0, 0, 0, 0);
  // The TZ-shifted date may be a different calendar day than UTC; we want
  // the UTC instant equal to "today 00:00 Istanbul".
  const offsetMs = now.getTime() - tzMidnight.getTime();
  const startUtc = new Date(now.getTime() - offsetMs);

  const { count, error } = await supabase
    .from("geocoding_api_calls")
    .select("*", { count: "exact", head: true })
    .gte("called_at", startUtc.toISOString());

  if (error) {
    logger.warn({ code: error.code }, "today_calls_count_failed");
    return 0;
  }
  return count ?? 0;
}
