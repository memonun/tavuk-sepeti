import "server-only";

/**
 * `order_ad_signals` — the short-lived Meta matching signals of a web order
 * (migration 20261107235419). Service-role only: the table has RLS on and no
 * policy, so nothing but this module can read it.
 *
 * Holds hashes and Meta's own cookies, never a plain e-mail or phone. Rows are
 * deleted once the sale is reported, and anything older than Meta's 7-day
 * window is pruned on every new write — no row outlives its use.
 */
import { z } from "zod";

import { MAX_EVENT_AGE_MS, type PurchaseFacts, type PurchaseMatchSignals } from "@/features/storefront/domain/meta-purchase-event";
import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";

export async function saveOrderAdSignals(
  orderId: string,
  signals: PurchaseMatchSignals,
): Promise<Result<void, ExternalApiError>> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase.from("order_ad_signals").upsert({
    order_id: orderId,
    email_hash: signals.emailHash,
    phone_hash: signals.phoneHash,
    fbp: signals.fbp,
    fbc: signals.fbc,
    client_ip: signals.clientIp,
    user_agent: signals.userAgent,
  });
  if (error) {
    logger.warn({ orderId, code: error.code }, "order_ad_signals_save_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  // Unpaid card orders never get reported; their rows go once Meta could no
  // longer use them anyway. A failed prune is retried by the next order.
  const cutoff = new Date(Date.now() - MAX_EVENT_AGE_MS).toISOString();
  const { error: pruneError } = await supabase.from("order_ad_signals").delete().lt("created_at", cutoff);
  if (pruneError) logger.warn({ code: pruneError.code }, "order_ad_signals_prune_failed");

  return ok(undefined);
}

const rowSchema = z.object({
  email_hash: z.string().nullable(),
  phone_hash: z.string().nullable(),
  fbp: z.string().nullable(),
  fbc: z.string().nullable(),
  client_ip: z.string().nullable(),
  user_agent: z.string().nullable(),
  created_at: z.string(),
  orders: z.object({
    order_number: z.string().min(1),
    // `positive`: a sale reported at 0 ₺ is worse than one not reported.
    total_minor: z.coerce.number().positive(),
    order_items: z.array(
      z.object({
        product_key: z.string().min(1),
        quantity: z.coerce.number().positive(),
      }),
    ),
  }),
});

export interface PendingPurchaseReport {
  readonly purchase: PurchaseFacts;
  readonly signals: PurchaseMatchSignals;
  readonly capturedAtMs: number;
}

/** The order's signals plus the order facts to report, in one query (§9). */
export async function readPendingPurchaseReport(
  orderId: string,
): Promise<Result<PendingPurchaseReport | null, ExternalApiError>> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("order_ad_signals")
    .select(
      "email_hash, phone_hash, fbp, fbc, client_ip, user_agent, created_at, orders ( order_number, total_minor, order_items ( product_key, quantity ) )",
    )
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) {
    logger.warn({ orderId, code: error.code }, "order_ad_signals_read_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  if (!data) return ok(null);

  const parsed = rowSchema.safeParse(data);
  if (!parsed.success) {
    logger.warn({ orderId }, "order_ad_signals_row_unparsable");
    return err(new ExternalApiError({ message: "Sipariş verisi okunamadı.", cause: parsed.error }));
  }

  const row = parsed.data;
  return ok({
    purchase: {
      orderNumber: row.orders.order_number,
      totalMinor: Math.round(row.orders.total_minor),
      items: row.orders.order_items.map((item) => ({ productKey: item.product_key, quantity: item.quantity })),
    },
    signals: {
      emailHash: row.email_hash,
      phoneHash: row.phone_hash,
      fbp: row.fbp,
      fbc: row.fbc,
      clientIp: row.client_ip,
      userAgent: row.user_agent,
    },
    capturedAtMs: Date.parse(row.created_at),
  });
}

export async function deleteOrderAdSignals(orderId: string): Promise<void> {
  const { error } = await getSupabaseAdminClient().from("order_ad_signals").delete().eq("order_id", orderId);
  // The 7-day prune removes it anyway; just note it.
  if (error) logger.warn({ orderId, code: error.code }, "order_ad_signals_delete_failed");
}
