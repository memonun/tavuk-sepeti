import { computeDashboardManifest } from "@/features/orders/domain/dashboard-manifest";
import {
  countUndeliveredOrders,
  fetchCargoBacklogPrepOrders,
  fetchTodayRoutePrepOrders,
} from "@/features/orders/infrastructure/order.repository";
import { todayInIstanbul } from "@/shared/utils/date";

import type { DashboardManifest } from "@/features/orders/domain/dashboard-manifest";

export interface OrderDashboardStats {
  /** Every order not yet delivered or cancelled, across both channels. */
  readonly undeliveredOrders: number;
  /** Today's route orders and the cargo backlog, kept in separate buckets so
   *  a days-old unshipped cargo order never reads as "today's" business —
   *  route.orderCount / cargo.orderCount are what the dashboard tiles show,
   *  `lines` is the combined per-product prep list. */
  readonly prepManifest: DashboardManifest;
}

export async function getDashboardOrderStats(): Promise<OrderDashboardStats> {
  const today = todayInIstanbul();
  const [undeliveredOrders, routeOrders, cargoOrders] = await Promise.all([
    countUndeliveredOrders(),
    fetchTodayRoutePrepOrders(today),
    fetchCargoBacklogPrepOrders(),
  ]);

  return {
    undeliveredOrders,
    prepManifest: computeDashboardManifest(routeOrders, cargoOrders),
  };
}
