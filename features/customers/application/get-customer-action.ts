"use server";

import { z } from "zod";

import { getCustomerById } from "@/features/customers/application/get-customer";
import { assertAdmin } from "@/features/auth/application/assert-admin";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, type Result } from "@/shared/result";

import type { Customer } from "@/features/customers/domain/customer";

/**
 * Client-callable wrapper around the server-only `getCustomerById`.
 *
 * `get-customer.ts` imports `"server-only"`, so it can't be invoked from a
 * client component directly. This Server Action exposes a single-customer
 * fetch to the grid's detail-panel loader.
 *
 * Auth + input validation are enforced here per CLAUDE.md §4: every Server
 * Action's first line is auth, then Zod parse.
 */

const idSchema = z.string().uuid();

export async function getCustomerByIdAction(
  id: string,
): Promise<Result<Customer, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz müşteri kimliği." }));
  }

  return getCustomerById(parsed.data);
}
