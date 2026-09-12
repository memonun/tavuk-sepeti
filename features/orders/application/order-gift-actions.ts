"use server";

/**
 * Add/remove a gift item on an order. Both mutate order_gift_items only —
 * they never touch the order's totals, items, or status.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { createOrderGiftSchema } from "@/features/orders/domain/order-gift";
import {
  createOrderGift,
  deleteOrderGift,
} from "@/features/orders/infrastructure/order-gift.repository";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, type Result } from "@/shared/result";

import type { OrderGiftItem } from "@/features/orders/domain/order-gift";

export async function addOrderGiftAction(
  rawInput: unknown,
): Promise<Result<OrderGiftItem, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = createOrderGiftSchema.safeParse(rawInput);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "add_order_gift_invalid_input");
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz hediye kaydı.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const result = await createOrderGift(parsed.data);
  if (result.ok) revalidatePath(`/orders/${parsed.data.order_id}`);
  return result;
}

const removeInputSchema = z.object({
  gift_id: z.string().uuid(),
  order_id: z.string().uuid(),
});

export async function removeOrderGiftAction(
  giftId: string,
  orderId: string,
): Promise<Result<void, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = removeInputSchema.safeParse({ gift_id: giftId, order_id: orderId });
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz hediye kimliği." }));
  }

  const result = await deleteOrderGift(parsed.data.gift_id);
  if (result.ok) revalidatePath(`/orders/${parsed.data.order_id}`);
  return result;
}
