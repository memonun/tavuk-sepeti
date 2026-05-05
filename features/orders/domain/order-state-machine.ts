/**
 * Order state machine — pure TS reducer.
 *
 * Allowed transitions (SPEC.md §3.6):
 *
 *   pending ──→ confirmed ──→ delivered   (terminal)
 *      │            │
 *      ↓            ↓
 *   cancelled    cancelled                 (terminal)
 *
 *   delivered → *   FORBIDDEN
 *   cancelled → *   FORBIDDEN
 *
 * Cancellation requires a non-empty reason. Other transitions don't.
 *
 * The reducer is the single source of truth. Repository / Server Action
 * call it before persisting; if it returns Err, the persist is skipped.
 * No DB trigger or check constraint shadows this — domain rules live in
 * the domain layer.
 */
import { OrderInvalidTransitionError } from "@/features/orders/domain/order.errors";
import { err, ok, type Result } from "@/shared/result";

import type { Order, OrderStatus } from "@/features/orders/domain/order";

const ALLOWED: Readonly<Record<OrderStatus, ReadonlySet<OrderStatus>>> = {
  pending: new Set<OrderStatus>(["confirmed", "cancelled"]),
  confirmed: new Set<OrderStatus>(["delivered", "cancelled"]),
  delivered: new Set<OrderStatus>(),
  cancelled: new Set<OrderStatus>(),
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED[from].has(to);
}

export function isTerminal(status: OrderStatus): boolean {
  return ALLOWED[status].size === 0;
}

export interface TransitionOptions {
  /** Required for cancellations, optional for everything else. */
  reason?: string | null;
  actor: { id: string };
}

/**
 * Apply a transition to an order. Returns the order with the new status,
 * or an error explaining why the transition was rejected.
 *
 * Doesn't mutate input — returns a new Order. Doesn't write to the DB —
 * caller is responsible for persisting + writing the audit event.
 */
export function transitionOrder(
  order: Order,
  to: OrderStatus,
  opts: TransitionOptions,
): Result<Order, OrderInvalidTransitionError> {
  const from = order.status;

  if (!canTransition(from, to)) {
    return err(
      new OrderInvalidTransitionError({ from, to, rule: "not_allowed" }),
    );
  }

  if (to === "cancelled") {
    const reason = opts.reason?.trim() ?? "";
    if (reason.length === 0) {
      return err(
        new OrderInvalidTransitionError({ from, to, rule: "missing_reason" }),
      );
    }
  }

  return ok({
    ...order,
    status: to,
    updated_at: new Date(),
  });
}
