"use server";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { listOrders } from "@/features/orders/application/list-orders";
import { err, ok, type Result } from "@/shared/result";

import type { OrderListItem } from "@/features/orders/application/list-orders";
import type { AppError } from "@/shared/errors/app-error";

export interface CustomerOrdersResult {
  items: OrderListItem[];
  total: number;
}

/**
 * Cross-feature public API: returns a single customer's orders for the
 * customer-detail surfaces (route page + grid Sheet). Admin-gated, then
 * delegates to `listOrders` with a customer filter (pageSize 100 — a single
 * customer is not expected to exceed this; pagination lives on the orders
 * grid proper). Returns `total` alongside `items` so callers can surface a
 * truncation note when the customer has more than 100 orders.
 */
export async function listCustomerOrdersAction(
  customerId: string,
): Promise<Result<CustomerOrdersResult, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const result = await listOrders({ customer_id: customerId, pageSize: 100 });
  if (!result.ok) return err(result.error);

  return ok({ items: result.value.items, total: result.value.total });
}
