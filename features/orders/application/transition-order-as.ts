/**
 * Order status transition with an EXPLICIT actor.
 *
 * Split out of `transition-order.ts` (a "use server" file) because every export
 * of a "use server" module becomes a publicly callable Server Action — and a
 * function that accepts the actor as a parameter must never be reachable from
 * the browser. Callers here have already authenticated + authorised the actor
 * (the Server Action via `getCurrentUser`, the MCP connector via its verified
 * admin bearer token).
 *
 *   1. Load the order (so we know its current status).
 *   2. Run the pure TS reducer — single source of truth for the state graph
 *      and the cancel-reason rule.
 *   3. If allowed, persist via the transition_order_status RPC (atomic
 *      UPDATE + audit insert).
 *   4. Audit log. Cache revalidation stays with the caller.
 */
import "server-only";

import { transitionOrder } from "@/features/orders/domain/order-state-machine";
import {
  findOrderById,
  persistTransition,
} from "@/features/orders/infrastructure/order.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";

import type { OrderStatus } from "@/features/orders/domain/order";

export interface TransitionInput {
  order_id: string;
  to_status: OrderStatus;
  reason?: string | null;
}

export type TransitionOrderResult =
  | { status: "success"; orderId: string; fromStatus: OrderStatus; toStatus: OrderStatus }
  | { status: "error"; message: string };

export interface TransitionOptions {
  /** Where the change came from; lands in the audit row so MCP edits are traceable. */
  readonly source?: "panel" | "mcp";
}

export async function transitionOrderAs(
  actor: { readonly id: string },
  input: TransitionInput,
  options: TransitionOptions = {},
): Promise<TransitionOrderResult> {
  const orderResult = await findOrderById(input.order_id);
  if (!orderResult.ok) {
    return { status: "error", message: orderResult.error.message };
  }

  const reducerResult = transitionOrder(orderResult.value, input.to_status, {
    reason: input.reason ?? null,
    actor: { id: actor.id },
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
    actor_id: actor.id,
  });
  if (!persisted.ok) {
    return { status: "error", message: persisted.error.message };
  }

  await logAudit({
    actor_id: actor.id,
    action: "order.transitioned",
    entity_type: "order",
    entity_id: input.order_id,
    before: { status: orderResult.value.status },
    after: { status: input.to_status },
    ...(input.reason || options.source
      ? {
          metadata: {
            ...(input.reason ? { reason: input.reason } : {}),
            ...(options.source ? { source: options.source } : {}),
          },
        }
      : {}),
  });

  return {
    status: "success",
    orderId: input.order_id,
    fromStatus: orderResult.value.status,
    toStatus: input.to_status,
  };
}
