import "server-only";

/**
 * Reads one order's payment state by ORDER NUMBER through the service-role
 * client — no session, no RLS.
 *
 * Authorization is NOT this function's job and it cannot do it: the caller must
 * already have established the right to ask about this order (a matching
 * session, or a valid card-return token — see
 * `features/payments/domain/paytr.ts#signOrderReturnToken`). It is deliberately
 * narrow for that reason: it returns the payment state and nothing else, so a
 * mistake upstream leaks a boolean rather than a customer's address, items or
 * name.
 */
import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";

export async function readOrderPaymentStatus(
  orderNumber: string,
): Promise<Result<string | null, ExternalApiError>> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("orders")
    .select("payment_status")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) {
    logger.warn({ code: error.code }, "order_payment_state_read_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  return ok(data ? String(data.payment_status) : null);
}
