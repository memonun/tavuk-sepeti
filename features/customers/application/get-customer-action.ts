"use server";

import { getCustomerById } from "@/features/customers/application/get-customer";
import type { Customer } from "@/features/customers/domain/customer";
import type { AppError } from "@/shared/errors/app-error";
import type { Result } from "@/shared/result";

/**
 * Client-callable wrapper around the server-only `getCustomerById`.
 *
 * `get-customer.ts` imports `"server-only"`, so it can't be invoked from a
 * client component directly. This Server Action exposes a single-customer
 * fetch to the grid's detail-panel loader.
 */
export async function getCustomerByIdAction(
  id: string,
): Promise<Result<Customer, AppError>> {
  return getCustomerById(id);
}
