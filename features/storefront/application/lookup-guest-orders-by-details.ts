import "server-only";

/**
 * Read every order matching phone + placement date + order type, for a guest
 * who no longer has (or never kept) their order number. Same non-disclosure
 * contract as lookupGuestOrder: a miss on any of the three criteria returns
 * an empty array, never a distinguishable reason.
 *
 * Rate-limited server-side inside lookup_guest_orders_by_details (per phone
 * and per IP) — dropping order_number as the second factor shrinks the
 * search space, so this RPC logs and throttles attempts itself.
 */
import { AppError, ExternalApiError, RateLimitedError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";
import { normalizeTRPhone } from "@/shared/utils/phone";

import { mapGuestOrderRow, type GuestOrderView } from "@/features/storefront/application/lookup-guest-order";
import type { GuestOrderType } from "@/features/storefront/domain/guest-order-lookup.schema";

const RATE_LIMIT_PG_ERRCODE = "P0002";

export async function lookupGuestOrdersByDetails(
  phone: string,
  orderDate: string,
  orderType: GuestOrderType,
  ip: string | null,
): Promise<Result<GuestOrderView[], AppError>> {
  const normalizedPhone = normalizeTRPhone(phone);
  if (!normalizedPhone) return ok([]);

  const supabase = getSupabaseAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("lookup_guest_orders_by_details", {
    p_phone: normalizedPhone,
    p_order_date: orderDate,
    p_order_type: orderType,
    p_ip: ip,
  });

  if (error) {
    if (error.code === RATE_LIMIT_PG_ERRCODE) {
      return err(new RateLimitedError({ message: "Çok fazla deneme yapıldı." }));
    }
    logger.error({ code: error.code }, "lookup_guest_orders_by_details_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  return ok(rows.filter((r) => r.order_id).map(mapGuestOrderRow));
}
