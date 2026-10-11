/**
 * Per-day route-delivery totals (delivery_counts_by_day RPC). Aggregated in
 * the database so a caller showing a month never pulls that month's orders
 * (CLAUDE.md §9).
 */
import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export interface DeliveryCountRow {
  /** YYYY-MM-DD (orders.scheduled_for). */
  readonly day: string;
  /** Non-cancelled route-delivery orders scheduled for the day. */
  readonly total: number;
  /** How many of those are already delivered. */
  readonly delivered: number;
}

/** Both ends inclusive. */
export async function fetchDeliveryCountsByDay(
  from: string,
  to: string,
): Promise<Result<DeliveryCountRow[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("delivery_counts_by_day", { p_from: from, p_to: to });
  if (error) {
    logger.error({ code: error.code, message: error.message }, "delivery_counts_by_day_failed");
    return err(new ExternalApiError({ message: "Teslimat sayıları yüklenemedi.", cause: error }));
  }
  return ok((data ?? []).map((row) => ({ day: row.day, total: row.total, delivered: row.delivered })));
}
