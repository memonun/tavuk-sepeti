"use server";

/**
 * Client-callable wrapper around the server-only `getOrderById`.
 *
 * `get-order.ts` re-exports from the infrastructure layer which imports
 * `"server-only"`, so it can't be invoked from a client component directly.
 * This Server Action exposes a single-order fetch to the detail-panel loader.
 *
 * Auth + input validation are enforced here per CLAUDE.md §4: every Server
 * Action's first line is auth, then Zod parse.
 */
import { z } from "zod";

import { getOrderById } from "@/features/orders/application/get-order";
import { assertAdmin } from "@/features/auth/application/assert-admin";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, type Result } from "@/shared/result";

import type { Order } from "@/features/orders/domain/order";

const idSchema = z.string().uuid();

export async function getOrderByIdAction(id: string): Promise<Result<Order, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz sipariş kimliği." }));
  }

  // getOrderById returns Result<Order, OrderRepoFailure> where OrderRepoFailure
  // extends AppError — assignable without a cast.
  return getOrderById(parsed.data);
}
