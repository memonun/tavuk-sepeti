/**
 * Payment-result writer. Called from the PayTR callback (a system webhook on
 * behalf of no signed-in user) via the service-role client — the sanctioned
 * use of the admin client. Idempotent and amount-checked so a replayed or
 * tampered notification can't over-credit an order.
 */
import "server-only";

import { ExternalApiError, NotFoundError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";

export type PaidOutcome = "paid" | "already_paid" | "amount_mismatch";

export async function markOrderPaidIfAmountMatches(
  orderId: string,
  paidAmountMinor: number,
): Promise<Result<PaidOutcome, ExternalApiError | NotFoundError>> {
  const supabase = getSupabaseAdminClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("total_minor, payment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    logger.error({ orderId, code: error.code }, "mark_paid_fetch_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  if (!order) return err(new NotFoundError({ message: "Sipariş bulunamadı." }));
  if (order.payment_status === "paid") return ok("already_paid");
  if (Number(order.total_minor ?? 0) !== paidAmountMinor) {
    logger.warn(
      { orderId, expected: order.total_minor, got: paidAmountMinor },
      "paytr_amount_mismatch",
    );
    return ok("amount_mismatch");
  }

  const { error: upErr } = await supabase
    .from("orders")
    .update({ payment_status: "paid", paid_at: new Date().toISOString() })
    .eq("id", orderId);
  if (upErr) {
    logger.error({ orderId, code: upErr.code }, "mark_paid_update_failed");
    return err(new ExternalApiError({ message: upErr.message, cause: upErr }));
  }
  return ok("paid");
}

export async function markOrderPaymentFailed(
  orderId: string,
): Promise<Result<void, ExternalApiError>> {
  const supabase = getSupabaseAdminClient();
  // Only flip pending → failed; never touch an already-paid order.
  const { error } = await supabase
    .from("orders")
    .update({ payment_status: "failed" })
    .eq("id", orderId)
    .eq("payment_status", "pending");
  if (error) {
    logger.error({ orderId, code: error.code }, "mark_failed_update_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}
