/**
 * Pure split of a day's orders into the ones to OPTIMIZE versus the ones to
 * keep out of the Google waypoint set.
 *
 * Already-delivered stops must not be sent to the optimizer: it would sequence
 * the driving route THROUGH a place the driver has already been, distorting the
 * remaining path (and, on a mid-day re-optimize from the live position, route
 * the driver backwards). They're surfaced as `completedMarkers` so the map can
 * still show them as muted "done" pins for context.
 *
 * The excluded set is frozen by the caller (carried in the route URL), not read
 * live from order status — that's deliberate: it keeps the waypoint set, and so
 * the Directions cache key, stable across the passive refresh after each
 * delivery, so a routine delivery costs no Google call and never reshuffles the
 * route. Only an explicit re-optimize recomputes the set. See get-day-route.ts.
 *
 * Kept pure (no IO/logging) so it's trivially unit-testable; generic over a
 * minimal candidate shape so DayOrder is structurally assignable (mirrors
 * RouteDestinationCandidate in route-destination.ts).
 */
import type { CompletedMarker } from "@/features/routing/domain/route";

/** Minimal order shape the partition needs. DayOrder is structurally assignable. */
export interface DeliveredPartitionCandidate {
  readonly order_id: string;
  readonly order_number: string;
  readonly customer_first_name: string;
  readonly customer_last_name: string;
  readonly lat: number;
  readonly lng: number;
}

export interface PartitionedOrders<T extends DeliveredPartitionCandidate> {
  /** Orders to optimize as waypoints, in input order. */
  readonly routed: T[];
  /** Excluded (already-delivered) orders as map-only markers, in input order. */
  readonly completedMarkers: CompletedMarker[];
}

export function partitionDeliveredOrders<T extends DeliveredPartitionCandidate>(
  orders: readonly T[],
  excludeOrderIds: Iterable<string>,
): PartitionedOrders<T> {
  const exclude = new Set(excludeOrderIds);
  const routed: T[] = [];
  const completedMarkers: CompletedMarker[] = [];

  for (const order of orders) {
    if (exclude.has(order.order_id)) {
      completedMarkers.push({
        order_id: order.order_id,
        order_number: order.order_number,
        customer_name:
          `${order.customer_first_name} ${order.customer_last_name}`.trim(),
        lat: order.lat,
        lng: order.lng,
      });
    } else {
      routed.push(order);
    }
  }

  return { routed, completedMarkers };
}
