import "server-only";

/**
 * Reports a web sale to Meta from the SERVER (Conversions API), next to the
 * browser Pixel's own `Purchase` — owner decision 2026-11-08.
 *
 * Two steps, because the card path is split in time:
 *   1. `captureOrderAdSignals` — at order placement, while the customer's
 *      request is still here: hash e-mail/phone and keep Meta's cookies, IP
 *      and user agent in `order_ad_signals`.
 *   2. `reportPurchaseToMeta` — once the sale is real: right after placement
 *      for kapıda ödeme / havale (placeOrderAction), from PayTR's verified
 *      callback for a card (the payments feature calls in here, like it does
 *      for the confirmation e-mail). Sends, then deletes the signals.
 *
 * Same rule as the Pixel: a wrong Purchase is worse than a missing one, so the
 * amount and lines come from the order row, and only these two moments report.
 * Respects the browser's Global Privacy Control signal (`Sec-GPC: 1`): nothing
 * is captured, so nothing can be sent.
 *
 * Best-effort, like the e-mails: nothing here throws, and a failure never
 * costs the customer their order or PayTR its "OK".
 */
import { cookies, headers } from "next/headers";

import {
  buildMetaPurchaseEvent,
  hashEmail,
  hashPhone,
  MAX_EVENT_AGE_MS,
  sanitizeClientIp,
  sanitizeMetaCookie,
  sanitizeUserAgent,
} from "@/features/storefront/domain/meta-purchase-event";
import {
  isMetaConversionsEnabled,
  sendMetaServerEvent,
} from "@/features/storefront/infrastructure/meta-conversions.client";
import {
  deleteOrderAdSignals,
  readPendingPurchaseReport,
  saveOrderAdSignals,
} from "@/features/storefront/infrastructure/order-ad-signals.repository";
import { env } from "@/shared/env";
import { logger } from "@/shared/logger";

export async function captureOrderAdSignals(input: {
  readonly orderId: string;
  readonly email: string | null;
  readonly phone: string | null;
}): Promise<void> {
  try {
    if (!isMetaConversionsEnabled()) return;
    const hdrs = await headers();
    if (hdrs.get("sec-gpc")?.trim() === "1") return;
    const jar = await cookies();

    await saveOrderAdSignals(input.orderId, {
      emailHash: hashEmail(input.email),
      phoneHash: hashPhone(input.phone),
      fbp: sanitizeMetaCookie(jar.get("_fbp")?.value),
      fbc: sanitizeMetaCookie(jar.get("_fbc")?.value),
      clientIp: sanitizeClientIp(hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip")),
      userAgent: sanitizeUserAgent(hdrs.get("user-agent")),
    });
  } catch (cause) {
    logger.warn({ orderId: input.orderId, cause: cause instanceof Error ? cause.name : "unknown" }, "meta_capi_capture_failed");
  }
}

export type MetaPurchaseOutcome =
  | "sent"
  | "skipped_not_configured"
  | "skipped_no_signals"
  | "skipped_stale"
  | "failed";

export async function reportPurchaseToMeta(orderId: string): Promise<MetaPurchaseOutcome> {
  try {
    if (!isMetaConversionsEnabled()) return "skipped_not_configured";

    const pending = await readPendingPurchaseReport(orderId);
    if (!pending.ok) return "failed";
    // No row: GPC, capture failed, or already reported (a repeated callback).
    if (!pending.value) return "skipped_no_signals";

    const now = Date.now();
    if (now - pending.value.capturedAtMs > MAX_EVENT_AGE_MS) {
      await deleteOrderAdSignals(orderId);
      return "skipped_stale";
    }

    const event = buildMetaPurchaseEvent({
      purchase: pending.value.purchase,
      signals: pending.value.signals,
      eventTimeMs: now,
      eventSourceUrl: `${env.NEXT_PUBLIC_APP_URL}/odeme`,
    });
    const sent = await sendMetaServerEvent(event);
    // Row kept on failure: nothing retries automatically, but the facts stay
    // available for 7 days and the failure is in the logs.
    if (!sent.ok) return "failed";
    if (sent.value === "skipped") return "skipped_not_configured";

    await deleteOrderAdSignals(orderId);
    return "sent";
  } catch (cause) {
    logger.error({ orderId, cause: cause instanceof Error ? cause.name : "unknown" }, "meta_capi_report_failed");
    return "failed";
  }
}
