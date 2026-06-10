"use server";

/**
 * Client-callable wrapper around the server-only `getOrderEvents`.
 *
 * Mirrors `get-order-action.ts`: `get-order.ts` re-exports from the
 * infrastructure layer (which imports `"server-only"`), so the status-event
 * fetch can't be invoked from a client component directly. This Server Action
 * exposes the order's status timeline to the detail-panel loader.
 *
 * Auth + input validation are enforced here per CLAUDE.md §4: every Server
 * Action's first line is auth, then Zod parse.
 */
import { z } from "zod";

import { getOrderEvents } from "@/features/orders/application/get-order";
import { assertAdmin } from "@/features/auth/application/assert-admin";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, type Result } from "@/shared/result";

import type { OrderStatusEvent } from "@/features/orders/domain/order";

const idSchema = z.string().uuid();

export async function listOrderEventsAction(
  orderId: string,
): Promise<Result<OrderStatusEvent[], AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = idSchema.safeParse(orderId);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz sipariş kimliği." }));
  }

  // getOrderEvents returns Result<OrderStatusEvent[], OrderRepoFailure> where
  // OrderRepoFailure extends AppError — assignable without a cast.
  return getOrderEvents(parsed.data);
}
