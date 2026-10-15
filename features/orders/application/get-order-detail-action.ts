"use server";

/**
 * Everything the grid's order Sheet shows, in ONE Server Action.
 *
 * Why: the Sheet used to call five actions (order, events, payments, gifts,
 * then the customer's special prices). Next.js runs a client's Server Actions
 * one after another, not in parallel, so that was five sequential HTTP round
 * trips from the phone — each paying the proxy's session check and most an
 * admin check too. Here the auth check runs once and the reads run together on
 * the server, next to the database. Same reads, same fallbacks as the
 * /orders/[id] page (app/(admin)/orders/[id]/page.tsx).
 *
 * Auth + input validation first, per CLAUDE.md §4.
 */
import { z } from "zod";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { loadCustomerProductPriceMap } from "@/features/customers/application/customer-prices";
import { getOrderById, getOrderEvents } from "@/features/orders/application/get-order";
import { getOrderGifts } from "@/features/orders/application/get-order-gifts";
import { listPaymentsForOrder } from "@/features/orders/infrastructure/order-payment.repository";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import type { Order, OrderStatusEvent } from "@/features/orders/domain/order";
import type { OrderGiftItem } from "@/features/orders/domain/order-gift";
import type { OrderPayment } from "@/features/orders/domain/payment";

const idSchema = z.string().uuid();

export interface OrderDetail {
  readonly order: Order;
  readonly events: OrderStatusEvent[];
  readonly payments: OrderPayment[];
  readonly gifts: OrderGiftItem[];
  /** product_key → the customer's saved special price (kuruş). The edit form
   *  pre-fills its "Özel fiyat" fields from these; without them saving would
   *  re-price the order at catalog prices and delete the customer's specials. */
  readonly customerPrices: Record<string, number>;
}

export async function getOrderDetailAction(
  id: string,
): Promise<Result<OrderDetail, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz sipariş kimliği." }));
  }
  const orderId = parsed.data;

  const [orderResult, eventsResult, paymentsResult, giftsResult] = await Promise.all([
    getOrderById(orderId),
    getOrderEvents(orderId),
    listPaymentsForOrder(orderId),
    getOrderGifts(orderId),
  ]);
  if (!orderResult.ok) return err(orderResult.error);

  // Needs the order's customer, hence the second (server-side) step.
  const priceMap = await loadCustomerProductPriceMap(orderResult.value.customer_id);

  // Events / payments / gifts failing isn't fatal — the Sheet renders with an
  // empty timeline / ledger / gift list rather than blocking (same as before).
  return ok({
    order: orderResult.value,
    events: eventsResult.ok ? eventsResult.value : [],
    payments: paymentsResult.ok ? paymentsResult.value : [],
    gifts: giftsResult.ok ? giftsResult.value : [],
    customerPrices: Object.fromEntries(priceMap),
  });
}
