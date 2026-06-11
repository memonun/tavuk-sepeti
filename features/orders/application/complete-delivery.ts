"use server";

/**
 * Mark an order delivered, confirming it first if it's still pending.
 *
 * Drivers work a route whose orders may be `pending` (imported or freshly
 * placed). The state machine forbids `pending → delivered`, so a naive
 * "Teslim Edildi" tap fails with "Durum geçişi geçersiz: pending → delivered".
 *
 * This action removes that wall WITHOUT weakening the domain rules: it asks
 * `planDeliveryTransitions` for the ordered legal hops to reach `delivered`
 * and applies each via the same reducer + RPC + audit path as a single
 * transition. So `pending` walks `pending → confirmed → delivered`, each step
 * persisted and audit-logged independently; `confirmed` goes straight to
 * `delivered`; an already-`delivered` order is a no-op success (idempotent).
 */
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { transitionOrder } from "@/features/orders/domain/order-state-machine";
import { planDeliveryTransitions } from "@/features/orders/domain/plan-delivery-transitions";
import {
  findOrderById,
  persistTransition,
} from "@/features/orders/infrastructure/order.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";

export type CompleteDeliveryActionState =
  | { status: "success"; orderId: string }
  | { status: "error"; message: string };

export interface CompleteDeliveryInput {
  order_id: string;
}

export async function completeDeliveryAction(
  input: CompleteDeliveryInput,
): Promise<CompleteDeliveryActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  const orderResult = await findOrderById(input.order_id);
  if (!orderResult.ok) {
    return { status: "error", message: orderResult.error.message };
  }

  let order = orderResult.value;

  // Idempotent: a retry / double-tap on an already-delivered order succeeds.
  if (order.status === "delivered") {
    return { status: "success", orderId: input.order_id };
  }

  const hops = planDeliveryTransitions(order.status);
  if (hops.length === 0) {
    return {
      status: "error",
      message: `Bu sipariş teslim edilemez (durum: ${order.status}).`,
    };
  }

  for (const to of hops) {
    const reducerResult = transitionOrder(order, to, { actor: { id: user.id } });
    if (!reducerResult.ok) {
      logger.warn(
        {
          orderId: input.order_id,
          from: order.status,
          to,
          code: reducerResult.error.code,
        },
        "complete_delivery_transition_rejected",
      );
      return { status: "error", message: reducerResult.error.message };
    }

    const persisted = await persistTransition({
      order_id: input.order_id,
      to_status: to,
      reason: null,
      actor_id: user.id,
    });
    if (!persisted.ok) {
      // A mid-walk failure leaves the order at the last persisted step (e.g.
      // confirmed). That's a legal, non-corrupt state — the driver can retry,
      // which will resume from wherever it landed.
      return { status: "error", message: persisted.error.message };
    }

    await logAudit({
      actor_id: user.id,
      action: "order.transitioned",
      entity_type: "order",
      entity_id: input.order_id,
      before: { status: order.status },
      after: { status: to },
    });

    order = reducerResult.value;
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${input.order_id}`);
  revalidatePath("/routes");
  return { status: "success", orderId: input.order_id };
}
