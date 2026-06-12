"use server";

/**
 * Revert an accidental delivery: delivered → confirmed.
 *
 * `delivered` is terminal in the forward state machine (order-state-machine.ts)
 * — you cannot normally leave it. This is a deliberate ADMIN CORRECTION, not a
 * normal transition: a driver fat-fingers "Teslim Edildi" and needs to take it
 * back. It is intentionally narrow (only delivered → confirmed), audited as
 * `order.delivery_reverted`, and writes an order_status_events row (via the
 * same RPC) so the correction is fully traceable.
 *
 * It does NOT touch payments — money already collected stays on the ledger; the
 * driver can adjust that separately.
 */
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/features/auth/application/get-session";
import {
  findOrderById,
  persistTransition,
} from "@/features/orders/infrastructure/order.repository";
import { logAudit } from "@/shared/audit/log-audit";

export type RevertDeliveryActionState =
  | { status: "success"; orderId: string }
  | { status: "error"; message: string };

export interface RevertDeliveryInput {
  order_id: string;
}

export async function revertDeliveryAction(
  input: RevertDeliveryInput,
): Promise<RevertDeliveryActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  const orderResult = await findOrderById(input.order_id);
  if (!orderResult.ok) {
    return { status: "error", message: orderResult.error.message };
  }
  const order = orderResult.value;

  // Idempotent: already not-delivered → nothing to revert.
  if (order.status !== "delivered") {
    return { status: "success", orderId: input.order_id };
  }

  const persisted = await persistTransition({
    order_id: input.order_id,
    to_status: "confirmed",
    reason: "Teslimat geri alındı (düzeltme)",
    actor_id: user.id,
  });
  if (!persisted.ok) {
    return { status: "error", message: persisted.error.message };
  }

  await logAudit({
    actor_id: user.id,
    action: "order.delivery_reverted",
    entity_type: "order",
    entity_id: input.order_id,
    before: { status: "delivered" },
    after: { status: "confirmed" },
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${input.order_id}`);
  revalidatePath("/routes");
  return { status: "success", orderId: input.order_id };
}
