"use client";

/**
 * Reports Meta Pixel Purchase for a CARD order, from the PayTR return page.
 * Mounted by `PaymentSuccess` only once its own server poll reads "paid" and a
 * Pixel ID is set; renders nothing. A separate component (like
 * MetaCheckoutTracker) so the payment-return logic itself stays untouched.
 *
 * Order of operations matters:
 *   1. Ask the server for the paid order's total and lines. The browser's
 *      basket is not evidence — it may be another device's, or already empty.
 *      The server answers only for an order it reads as paid.
 *   2. Take the signed return token out of the address bar. Meta attaches the
 *      full page URL to every event; nothing is sent unless that succeeded.
 *   3. Send the PageView that arriving on the token URL held back, then the
 *      Purchase. `trackPurchase` guarantees at most one Purchase per order
 *      number, so a reload, back/forward or React re-running this effect cannot
 *      double count.
 *
 * A customer who pays but never comes back to this page (closes the tab at the
 * bank) is not reported — only a server-side Conversions API send can cover
 * that, and its dedupe key is already in place (`purchase:<order number>`).
 */
import { useEffect } from "react";

import { fetchPaidOrderPurchase } from "@/features/storefront/application/fetch-paid-order-purchase";
import {
  recallReturnToken,
  retireReturnTokenFromUrl,
} from "@/features/storefront/ui/card-return-token";
import { trackOrderPurchased } from "@/features/storefront/ui/meta-events";
import { flushDeferredPageView } from "@/shared/analytics/meta-pixel";

export function MetaPurchaseTracker({
  orderNumber,
  returnToken,
}: {
  orderNumber: string;
  returnToken: string | null;
}) {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const purchase = await fetchPaidOrderPurchase({
          orderNumber,
          returnToken: returnToken ?? recallReturnToken(orderNumber),
        });
        if (cancelled || !purchase) return;
        if (!retireReturnTokenFromUrl(orderNumber)) return;
        flushDeferredPageView();
        trackOrderPurchased(purchase);
      } catch {
        // Analytics must never affect the shop.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderNumber, returnToken]);

  return null;
}
