"use server";

/**
 * Order status transition flow:
 *   1. Auth.
 *   2. Load the order (so we know its current status).
 *   3. Run the pure TS reducer — single source of truth for the state graph
 *      and the cancel-reason rule.
 *   4. If allowed, persist via the transition_order_status RPC (atomic
 *      UPDATE + audit insert).
 *   5. Revalidate /orders + /orders/[id].
 */
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { transitionOrder } from "@/features/orders/domain/order-state-machine";
import {
  findOrderById,
  persistTransition,
} from "@/features/orders/infrastructure/order.repository";
import { logger } from "@/shared/logger";

import type { OrderStatus } from "@/features/orders/domain/order";

export type TransitionOrderActionState =
  | { status: "idle" }
  | { status: "success"; orderId: string; toStatus: OrderStatus }
  | { status: "error"; message: string };

export interface TransitionInput {
  order_id: string;
  to_status: OrderStatus;
  reason?: string | null;
}

export async function transitionOrderAction(
  input: TransitionInput,
): Promise<TransitionOrderActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  const orderResult = await findOrderById(input.order_id);
  if (!orderResult.ok) {
    return { status: "error", message: orderResult.error.message };
  }

  const reducerResult = transitionOrder(orderResult.value, input.to_status, {
    reason: input.reason ?? null,
    actor: { id: user.id },
  });
  if (!reducerResult.ok) {
    logger.warn(
      { orderId: input.order_id, from: orderResult.value.status, to: input.to_status, code: reducerResult.error.code },
      "order_transition_rejected",
    );
    return { status: "error", message: reducerResult.error.message };
  }

  const persisted = await persistTransition({
    order_id: input.order_id,
    to_status: input.to_status,
    reason: input.reason ?? null,
    actor_id: user.id,
  });
  if (!persisted.ok) {
    return { status: "error", message: persisted.error.message };
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${input.order_id}`);
  return { status: "success", orderId: input.order_id, toStatus: input.to_status };
}
