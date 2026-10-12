import "server-only";

/**
 * Reads one order's analytics summary (total + product keys and quantities) by
 * ORDER NUMBER through the service-role client — no session, no RLS.
 *
 * Like `readOrderPaymentStatus` next to it, authorization is NOT this
 * function's job: the caller must already have established the right to ask
 * about this order (see `getReturnOrderPurchase`). The select is kept to
 * columns that identify no person — no customer, no address, no notes — so a
 * mistake upstream leaks a basket, never who bought it or where it goes.
 *
 * One query, items embedded (CLAUDE.md §9 — no N+1). The row is Zod-parsed
 * rather than cast: `numeric` columns arrive as strings from PostgREST.
 */
import { z } from "zod";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";

import type { OrderPurchase } from "@/features/storefront/domain/order-purchase.schema";

const rowSchema = z.object({
  order_number: z.string().min(1),
  // `positive`, not `nonnegative`: `total_minor` is nullable and coercion turns
  // null into 0 — a sale reported at 0 ₺ is worse than one not reported.
  total_minor: z.coerce.number().positive(),
  order_items: z.array(
    z.object({
      product_key: z.string().min(1),
      quantity: z.coerce.number().positive(),
    }),
  ),
});

export async function readOrderPurchase(
  orderNumber: string,
): Promise<Result<OrderPurchase | null, ExternalApiError>> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("orders")
    .select("order_number, total_minor, order_items ( product_key, quantity )")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) {
    logger.warn({ code: error.code }, "order_purchase_read_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  if (!data) return ok(null);

  const parsed = rowSchema.safeParse(data);
  if (!parsed.success) {
    logger.warn({}, "order_purchase_row_unparsable");
    return err(
      new ExternalApiError({ message: "Sipariş verisi okunamadı.", cause: parsed.error }),
    );
  }

  return ok({
    orderNumber: parsed.data.order_number,
    totalMinor: Math.round(parsed.data.total_minor),
    items: parsed.data.order_items.map((item) => ({
      productKey: item.product_key,
      quantity: item.quantity,
    })),
  });
}
