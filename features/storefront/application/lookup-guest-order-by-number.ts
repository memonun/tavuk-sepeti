import "server-only";

/**
 * Read one order by its number ALONE — no phone, no order type.
 *
 * An explicit product decision: a guest who only has the order number handy
 * (not the phone it was placed with) should be able to look it up with
 * nothing else asked. That trades away the phone-based scanning defense
 * lookupGuestOrder and lookupGuestOrdersByDetails both rely on — order
 * numbers are sequential and therefore guessable — so rate limiting inside
 * lookup_guest_order_by_number (per number and per IP) is the only guard
 * against enumeration here.
 *
 * Because there is no phone on hand, an order found this way cannot offer
 * "Ödemeyi tamamla" (resumeCardPaymentAction requires a phone to prove
 * ownership for a guest) — the UI hides that button and points the customer
 * at the phone-based tab instead when a card payment is still pending.
 */
import { AppError, ExternalApiError, RateLimitedError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";

import { mapGuestOrderRow, type GuestOrderView } from "@/features/storefront/application/lookup-guest-order";

const RATE_LIMIT_PG_ERRCODE = "P0002";

export async function lookupGuestOrderByNumber(
  orderNumber: string,
  ip: string | null,
): Promise<Result<GuestOrderView | null, AppError>> {
  if (orderNumber.trim() === "") return ok(null);

  const supabase = getSupabaseAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("lookup_guest_order_by_number", {
    p_order_number: orderNumber.trim(),
    p_ip: ip,
  });

  if (error) {
    if (error.code === RATE_LIMIT_PG_ERRCODE) {
      return err(new RateLimitedError({ message: "Çok fazla deneme yapıldı." }));
    }
    logger.error({ code: error.code }, "lookup_guest_order_by_number_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | Record<string, unknown>
    | null
    | undefined;
  if (!row?.order_id) return ok(null);

  return ok(mapGuestOrderRow(row));
}
