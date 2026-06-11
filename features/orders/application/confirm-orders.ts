"use server";

/**
 * Bulk-confirm orders — the dispatch step behind "Onayla & Başlat".
 *
 * Flips every still-`pending` order in the list to `confirmed` in one
 * transaction (the confirm_route_orders RPC), then writes one audit_log row
 * per actually-confirmed order. Idempotent: re-running confirms nothing new
 * and reports `confirmed: 0`.
 *
 * Lives in the orders feature (confirming is an orders concern); the routing
 * UI calls it across the application boundary, the same way driver mode calls
 * completeDeliveryAction.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { confirmRouteOrders } from "@/features/orders/infrastructure/order.repository";
import { logBulkAudit } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";

const confirmOrdersSchema = z.object({
  order_ids: z.array(z.string().uuid()).min(1).max(100),
});

export type ConfirmOrdersActionState =
  | { status: "success"; confirmed: number }
  | { status: "error"; message: string };

export async function confirmOrdersAction(
  input: { order_ids: string[] },
): Promise<ConfirmOrdersActionState> {
  const parsed = confirmOrdersSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Geçersiz sipariş listesi." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  const result = await confirmRouteOrders(parsed.data.order_ids, user.id);
  if (!result.ok) {
    return { status: "error", message: result.error.message };
  }

  const confirmedIds = result.value;
  if (confirmedIds.length > 0) {
    await logBulkAudit(
      confirmedIds.map((id) => ({
        actor_id: user.id,
        action: "order.transitioned" as const,
        entity_type: "order" as const,
        entity_id: id,
        before: { status: "pending" },
        after: { status: "confirmed" },
      })),
    );
  }

  logger.info(
    { confirmed: confirmedIds.length, actorId: user.id },
    "route_orders_confirmed",
  );
  revalidatePath("/orders");
  revalidatePath("/routes");
  return { status: "success", confirmed: confirmedIds.length };
}
