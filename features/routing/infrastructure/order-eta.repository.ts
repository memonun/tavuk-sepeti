/**
 * Persists the dwell-aware per-stop ETAs a successful route optimization
 * already computed, so the customer-facing guest lookup can read them later
 * with zero new Google API calls. Best-effort by design — a failure here
 * must never break the admin's route view, which is why get-day-route.ts
 * only logs on error rather than propagating a Result.
 */
import "server-only";

import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export interface StopEta {
  readonly order_id: string;
  readonly eta_iso: string;
}

export async function persistStopEtas(stops: readonly StopEta[]): Promise<void> {
  if (stops.length === 0) return;

  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("set_order_eta_batch", {
    p_order_ids: stops.map((s) => s.order_id),
    p_eta_times: stops.map((s) => s.eta_iso),
  });

  if (error) {
    logger.warn({ code: error.code, message: error.message }, "persist_stop_etas_failed");
  }
}
