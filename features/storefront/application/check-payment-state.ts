"use server";

/**
 * Re-read a card order's payment state from the browser.
 *
 * The PayTR return page is rendered before the payment is booked more often
 * than not — PayTR redirects the customer the instant 3-D Secure clears, while
 * the server-to-server callback that writes the ledger row arrives seconds
 * later. Without this the page's verdict was frozen at whatever was true in
 * that first millisecond, so a successful payment read "Ödemeniz kontrol
 * ediliyor" until the customer thought to reload — and most don't; they write
 * to us instead, or pay twice.
 *
 * Authorization is `getReturnPaymentState`'s (session, else the signed return
 * token), and the answer is one of three strings — nothing about the order
 * leaks through this action beyond whether it is paid.
 */
import {
  getReturnPaymentState,
  type OrderPaymentState,
} from "@/features/storefront/application/get-order-payment-status";

export async function checkOrderPaymentState(input: {
  orderNumber: string;
  returnToken: string | null;
}): Promise<OrderPaymentState> {
  return getReturnPaymentState({
    orderNumber: input.orderNumber,
    returnToken: input.returnToken,
  });
}
