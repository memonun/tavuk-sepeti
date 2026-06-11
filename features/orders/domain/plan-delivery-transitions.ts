/**
 * Plan the ordered, legal status hops to drive an order to `delivered`.
 *
 * The state machine forbids skipping `confirmed` — `pending → delivered` is
 * illegal (see order-state-machine.ts). A driver marking a stop delivered
 * shouldn't have to care about that intermediate step: this returns the
 * sequence of legal transitions needed to reach `delivered` from the current
 * status, so the caller can apply them in order.
 *
 *   pending   → ["confirmed", "delivered"]
 *   confirmed → ["delivered"]
 *   delivered → []   (already there)
 *   cancelled → []   (terminal — cannot be delivered)
 *
 * Implemented as a breadth-first search over the transition graph (via
 * `allowedTransitions`) rather than a hard-coded path, so it stays correct
 * if the graph ever changes. The graph is tiny (4 nodes) — cost is trivial.
 * An empty result means "delivery is not reachable from here" (already
 * delivered, or cancelled) and the caller should treat it as a no-op /
 * rejection accordingly.
 */
import { allowedTransitions } from "@/features/orders/domain/order-state-machine";

import type { OrderStatus } from "@/features/orders/domain/order";

const TARGET: OrderStatus = "delivered";

export function planDeliveryTransitions(from: OrderStatus): OrderStatus[] {
  if (from === TARGET) return [];

  const queue: Array<{ status: OrderStatus; path: OrderStatus[] }> = [
    { status: from, path: [] },
  ];
  const seen = new Set<OrderStatus>([from]);

  while (queue.length > 0) {
    const head = queue.shift();
    if (!head) break; // unreachable given the loop guard; satisfies the type-checker
    for (const next of allowedTransitions(head.status)) {
      if (seen.has(next)) continue;
      const path = [...head.path, next];
      if (next === TARGET) return path;
      seen.add(next);
      queue.push({ status: next, path });
    }
  }

  return [];
}
