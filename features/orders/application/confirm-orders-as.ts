/**
 * Bulk-confirm orders with an EXPLICIT actor. Shared by the "Onayla & Başlat"
 * Server Action and the MCP connector. Kept out of the "use server" file for the
 * same reason as `transition-order-as.ts`: a function taking the actor as a
 * parameter must not be a publicly callable Server Action.
 *
 * Flips every still-`pending` order in the list to `confirmed` in one
 * transaction (the confirm_route_orders RPC), then writes one audit_log row per
 * actually-confirmed order. Idempotent: re-running confirms nothing new.
 */
import "server-only";

import { z } from "zod";

import { confirmRouteOrders } from "@/features/orders/infrastructure/order.repository";
import { logBulkAudit } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";

export const confirmOrdersSchema = z.object({
  order_ids: z.array(z.string().uuid()).min(1).max(100),
});

export type ConfirmOrdersResult =
  | { status: "success"; confirmed: number; confirmedIds: string[] }
  | { status: "error"; message: string };

export interface ConfirmOptions {
  readonly source?: "panel" | "mcp";
}

export async function confirmOrdersAs(
  actor: { readonly id: string },
  input: { order_ids: string[] },
  options: ConfirmOptions = {},
): Promise<ConfirmOrdersResult> {
  const parsed = confirmOrdersSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Geçersiz sipariş listesi." };
  }

  const result = await confirmRouteOrders(parsed.data.order_ids, actor.id);
  if (!result.ok) {
    return { status: "error", message: result.error.message };
  }

  const confirmedIds = result.value;
  if (confirmedIds.length > 0) {
    await logBulkAudit(
      confirmedIds.map((id) => ({
        actor_id: actor.id,
        action: "order.transitioned" as const,
        entity_type: "order" as const,
        entity_id: id,
        before: { status: "pending" },
        after: { status: "confirmed" },
        ...(options.source ? { metadata: { source: options.source } } : {}),
      })),
    );
  }

  logger.info(
    { confirmed: confirmedIds.length, actorId: actor.id, source: options.source ?? "panel" },
    "route_orders_confirmed",
  );
  return { status: "success", confirmed: confirmedIds.length, confirmedIds };
}
