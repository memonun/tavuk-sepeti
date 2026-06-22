import "server-only";

import { computeRouteManifest, type RouteManifest } from "@/features/routing/domain/route-manifest";
import { fetchDeliveryDetails } from "@/features/routing/infrastructure/order-delivery-details";

/**
 * Build the day's load manifest from the already-fetched day orders — WITHOUT
 * needing an optimized route. Enriches each order with its items + collected
 * amount (the same batched lookup the optimized route uses), then aggregates.
 *
 * Distance/duration/finish-ETA are NOT included here (those require Google
 * Directions); the route page adds them to the footer once a route is optimized.
 */
export async function buildDayLoadManifest(
  orders: readonly { order_id: string; total_minor: number }[],
): Promise<RouteManifest> {
  if (orders.length === 0) return computeRouteManifest([]);

  const details = await fetchDeliveryDetails(orders.map((o) => o.order_id));

  const stops = orders.map((o) => {
    const detail = details.get(o.order_id);
    return {
      order_id: o.order_id,
      total_minor: o.total_minor,
      amount_paid_minor: detail?.amount_paid_minor ?? 0,
      items: detail?.items ?? [],
    };
  });

  return computeRouteManifest(stops);
}
