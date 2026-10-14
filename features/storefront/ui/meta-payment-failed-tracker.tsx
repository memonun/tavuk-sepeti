"use client";

/**
 * Reports Meta Pixel PaymentFailed (custom event) when PayTR sends a customer
 * to /odeme/basarisiz. Renders nothing; mounted by that page only when a Pixel
 * ID is set. Once per order per tab — a reload of the page is not a second
 * failure. No order details are sent; the number is only the dedupe key.
 */
import { useEffect } from "react";

import { trackPaymentFailed } from "@/shared/analytics/meta-pixel";

export function MetaPaymentFailedTracker({ orderNumber }: { orderNumber: string | null }) {
  useEffect(() => {
    trackPaymentFailed({ orderId: orderNumber });
  }, [orderNumber]);

  return null;
}
