/**
 * Deliveries (and their undos) the driver made while offline, waiting to be
 * sent. Pure model + (de)serialization — the browser storage and the network
 * calls live in features/routing/ui/use-offline-delivery-queue.ts.
 *
 * Invariant: at most ONE pending operation per order. What matters to the
 * server is the order's final state, so a second tap on the same order either
 * replaces the first or cancels it:
 *   deliver, then revert  → net nothing (order was undelivered, still is)
 *   revert, then deliver  → net nothing (order was delivered, still is)
 * That also makes replay safe: nothing is ever sent twice in opposite order.
 */
import { z } from "zod";

export type QueuedOperationKind = "deliver" | "revert";

export interface QueuedOperation {
  readonly kind: QueuedOperationKind;
  readonly orderId: string;
  /** ISO time the driver tapped — for display/diagnostics only. */
  readonly queuedAt: string;
}

export type OfflineDeliveryQueue = ReadonlyArray<QueuedOperation>;

/** Bump when the stored shape changes; an unreadable/older payload is dropped
 *  rather than half-trusted. */
export const OFFLINE_QUEUE_STORAGE_KEY = "ts:drive:offline-queue:v1";

const operationSchema = z.object({
  kind: z.enum(["deliver", "revert"]),
  orderId: z.string().uuid(),
  queuedAt: z.string(),
});

const queueSchema = z.array(operationSchema);

/** Add an operation, applying the one-op-per-order rule above. */
export function enqueueOperation(
  queue: OfflineDeliveryQueue,
  op: QueuedOperation,
): OfflineDeliveryQueue {
  const existing = queue.find((q) => q.orderId === op.orderId);
  const rest = queue.filter((q) => q.orderId !== op.orderId);
  if (existing && existing.kind !== op.kind) return rest; // opposite → cancel out
  return [...rest, op];
}

export function removeOperation(
  queue: OfflineDeliveryQueue,
  orderId: string,
): OfflineDeliveryQueue {
  return queue.filter((q) => q.orderId !== orderId);
}

/** Order ids the queue says are delivered / un-delivered, for merging over the
 *  (possibly stale, cached) server state on screen. */
export function queuedDeliveredIds(queue: OfflineDeliveryQueue): ReadonlySet<string> {
  return new Set(queue.filter((q) => q.kind === "deliver").map((q) => q.orderId));
}
export function queuedRevertedIds(queue: OfflineDeliveryQueue): ReadonlySet<string> {
  return new Set(queue.filter((q) => q.kind === "revert").map((q) => q.orderId));
}

export function serializeQueue(queue: OfflineDeliveryQueue): string {
  return JSON.stringify(queue);
}

/** Storage is an outer boundary (CLAUDE.md §3): anything unparseable is an
 *  empty queue, never a crash on the driver's screen. */
export function parseQueue(raw: string | null): OfflineDeliveryQueue {
  if (!raw) return [];
  try {
    const parsed = queueSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
