import "server-only";

/**
 * The analytics summary of a card order — handed out ONLY once the server
 * itself says the order is paid.
 *
 * This is what lets the card-return page report a Meta Pixel `Purchase` with
 * the amount actually charged instead of whatever the browser believes was in
 * the basket. The gate is `getReturnPaymentState`, unchanged: the caller is
 * either the signed-in owner of the order or holds the signed return token for
 * exactly this order number, AND `orders.payment_status` — stamped by PayTR's
 * HMAC-verified callback — reads "paid". Anything else answers `null`; an
 * unpaid, unknown or somebody else's order is indistinguishable from outside.
 */
import { getReturnPaymentState } from "@/features/storefront/application/get-order-payment-status";
import { readOrderPurchase } from "@/features/storefront/infrastructure/order-purchase.repository";

import type {
  OrderPurchase,
  PaidOrderPurchaseInput,
} from "@/features/storefront/domain/order-purchase.schema";

export async function getReturnOrderPurchase(
  input: PaidOrderPurchaseInput,
): Promise<OrderPurchase | null> {
  const state = await getReturnPaymentState(input);
  if (state !== "paid") return null;

  const purchase = await readOrderPurchase(input.orderNumber);
  // Already logged by the repository. A missed analytics event is the whole
  // cost of a failed read here — the customer's page does not depend on it.
  if (!purchase.ok) return null;
  return purchase.value;
}
