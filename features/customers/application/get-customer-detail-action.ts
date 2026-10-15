"use server";

/**
 * Everything the grid's customer Sheet shows, in ONE Server Action: the
 * customer and their orders.
 *
 * Why: the Sheet used to fetch the customer, render, and only then fetch the
 * orders — two sequential round trips from the phone (Next runs a client's
 * Server Actions one at a time anyway). Here both reads run together on the
 * server, next to the database.
 *
 * Auth + input validation first, per CLAUDE.md §4.
 */
import { z } from "zod";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { getCustomerById } from "@/features/customers/application/get-customer";
import { listCustomerOrdersAction } from "@/features/orders/application/list-customer-orders";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import type { Customer } from "@/features/customers/domain/customer";
import type { CustomerOrdersResult } from "@/features/orders/application/list-customer-orders";

const idSchema = z.string().uuid();

export interface CustomerDetail {
  readonly customer: Customer;
  /** null when the orders read failed — the Sheet still shows the customer
   *  and says the orders couldn't be loaded (same as before). */
  readonly orders: CustomerOrdersResult | null;
}

export async function getCustomerDetailAction(
  id: string,
): Promise<Result<CustomerDetail, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz müşteri kimliği." }));
  }

  const [customerResult, ordersResult] = await Promise.all([
    getCustomerById(parsed.data),
    listCustomerOrdersAction(parsed.data),
  ]);
  if (!customerResult.ok) return err(customerResult.error);

  return ok({
    customer: customerResult.value,
    orders: ordersResult.ok ? ordersResult.value : null,
  });
}
