/**
 * Payment-result writer. Called from the PayTR callback (a system webhook on
 * behalf of no signed-in user) via the service-role client — the sanctioned
 * use of the admin client.
 *
 * Writes a row into the order_payments LEDGER rather than touching
 * orders.payment_status directly. That column, paid_at and amount_paid_minor
 * are derived by recompute_order_payment(), so a direct write desyncs the paid
 * amount immediately and gets silently reverted by the next recompute — see
 * 20260808120000_paytr_payment_ledger for the full failure.
 *
 * Idempotent via the (provider, provider_ref) unique index — PayTR retries the
 * notification until it receives "OK" — and amount-checked before anything is
 * written, so a tampered notification can't over-credit an order.
 */
import "server-only";

import { ExternalApiError, NotFoundError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";

/** Postgres unique_violation — the notification was already processed. */
const UNIQUE_VIOLATION = "23505";

export type CardPaymentOutcome =
  | "recorded"
  | "already_recorded"
  | "amount_mismatch";

export interface RecordCardPaymentInput {
  orderId: string;
  /** PayTR merchant_oid — the provider-side id, and our idempotency key. */
  merchantOid: string;
  /** Amount PayTR reports as collected, in kuruş. */
  paidAmountMinor: number;
}

export async function recordCardPayment(
  input: RecordCardPaymentInput,
): Promise<Result<CardPaymentOutcome, ExternalApiError | NotFoundError>> {
  const supabase = getSupabaseAdminClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("total_minor")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    logger.error(
      { orderId: input.orderId, code: error.code },
      "card_payment_order_fetch_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  if (!order) return err(new NotFoundError({ message: "Sipariş bulunamadı." }));

  // Never record a partial/inflated capture against the order. The amount is
  // checked BEFORE the insert so a mismatch leaves the ledger untouched.
  if (Number(order.total_minor ?? 0) !== input.paidAmountMinor) {
    logger.warn(
      {
        orderId: input.orderId,
        expected: order.total_minor,
        got: input.paidAmountMinor,
        merchantOid: input.merchantOid,
      },
      "paytr_amount_mismatch",
    );
    return ok("amount_mismatch");
  }

  const { error: insertError } = await supabase.from("order_payments").insert({
    order_id: input.orderId,
    amount_minor: input.paidAmountMinor,
    channel: "card",
    provider: "paytr",
    provider_ref: input.merchantOid,
  });

  if (insertError) {
    // A retried notification for a payment we already booked. Not an error —
    // PayTR just hasn't seen our "OK" yet.
    if (insertError.code === UNIQUE_VIOLATION) return ok("already_recorded");
    logger.error(
      { orderId: input.orderId, code: insertError.code },
      "card_payment_insert_failed",
    );
    return err(
      new ExternalApiError({ message: insertError.message, cause: insertError }),
    );
  }

  // order_payments_recompute has now derived payment_status / paid_at /
  // amount_paid_minor from the ledger. Nothing else to write.
  return ok("recorded");
}
