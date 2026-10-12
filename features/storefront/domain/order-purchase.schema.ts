/**
 * What a completed order reports to analytics — and nothing more.
 *
 * Deliberately the smallest shape that describes a sale: the order number (the
 * dedupe key), the amount the SERVER charged, and which products in what
 * quantity. No name, phone, e-mail or address ever travels in it, so the read
 * that produces it cannot leak personal data even if its caller is wrong.
 *
 * Client-safe: the checkout's success state and the card-return page both carry
 * this to the browser, where the Meta Pixel `Purchase` event is built from it.
 */
import { z } from "zod";

export const orderPurchaseSchema = z.object({
  orderNumber: z.string().min(1),
  /** Order total incl. delivery fee (kuruş) — what the customer pays. */
  totalMinor: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      /** `products.key`, the same id `order_items.product_key` stores. */
      productKey: z.string().min(1),
      quantity: z.number().positive(),
    }),
  ),
});

export type OrderPurchase = z.infer<typeof orderPurchaseSchema>;

/** Input of the card-return purchase read — same two fields the payment-state
 *  poll takes. Bounded so a hand-crafted call cannot post a megabyte "token". */
export const paidOrderPurchaseInputSchema = z.object({
  orderNumber: z.string().trim().min(1).max(64),
  returnToken: z.string().max(256).nullable(),
});

export type PaidOrderPurchaseInput = z.infer<typeof paidOrderPurchaseInputSchema>;
