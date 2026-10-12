"use server";

/**
 * The paid card order's analytics summary, for the browser.
 *
 * The card-return page calls this ONCE, after its own poll has already flipped
 * to "paid", to build the Meta Pixel `Purchase` event from what the server
 * charged (total + product keys/quantities — no personal data, see
 * `order-purchase.schema.ts`). Kept apart from `checkOrderPaymentState` on
 * purpose: that action promises to leak nothing but a paid/unpaid flag, and it
 * still does.
 *
 * `null` unless the server reads the order as paid AND the caller is authorized
 * for it (session owner, else the signed return token) — `getReturnOrderPurchase`.
 */
import { getReturnOrderPurchase } from "@/features/storefront/application/get-order-purchase";
import {
  paidOrderPurchaseInputSchema,
  type OrderPurchase,
} from "@/features/storefront/domain/order-purchase.schema";

export async function fetchPaidOrderPurchase(input: {
  orderNumber: string;
  returnToken: string | null;
}): Promise<OrderPurchase | null> {
  const parsed = paidOrderPurchaseInputSchema.safeParse(input);
  if (!parsed.success) return null;
  return getReturnOrderPurchase(parsed.data);
}
