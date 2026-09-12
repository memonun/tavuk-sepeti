"use server";

/**
 * Client-callable wrapper around the server-only `getOrderGifts`, for the
 * grid Sheet's detail loader (order-detail-loader.tsx) — mirrors
 * get-order-action.ts exactly.
 */
import { z } from "zod";

import { getOrderGifts } from "@/features/orders/application/get-order-gifts";
import { assertAdmin } from "@/features/auth/application/assert-admin";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, type Result } from "@/shared/result";

import type { OrderGiftItem } from "@/features/orders/domain/order-gift";

const idSchema = z.string().uuid();

export async function getOrderGiftsAction(
  orderId: string,
): Promise<Result<OrderGiftItem[], AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = idSchema.safeParse(orderId);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz sipariş kimliği." }));
  }

  return getOrderGifts(parsed.data);
}
