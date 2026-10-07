"use server";

/**
 * Order status transition Server Action: authenticate, delegate to
 * `transitionOrderAs` (the shared logic, also used by the MCP connector), then
 * revalidate /orders + /orders/[id].
 */
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/features/auth/application/get-session";
import {
  transitionOrderAs,
  type TransitionInput,
} from "@/features/orders/application/transition-order-as";

import type { OrderStatus } from "@/features/orders/domain/order";

export type TransitionOrderActionState =
  | { status: "idle" }
  | { status: "success"; orderId: string; toStatus: OrderStatus }
  | { status: "error"; message: string };

export async function transitionOrderAction(
  input: TransitionInput,
): Promise<TransitionOrderActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  const result = await transitionOrderAs(user, input);
  if (result.status === "error") return result;

  revalidatePath("/orders");
  revalidatePath(`/orders/${input.order_id}`);
  return { status: "success", orderId: result.orderId, toStatus: result.toStatus };
}
