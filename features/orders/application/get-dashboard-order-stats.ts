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
  /** Route orders scheduled for today and not yet delivered. */
  readonly todayRouteOrders: number;
  /** Cargo orders confirmed but not yet handed to the carrier. */
  readonly pendingCargo: number;
  /** What today's route + the whole cargo backlog add up to: per-product prep
   *  quantities, order count, expected revenue and what's still uncollected. */
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
    todayRouteOrders: routeOrders.length,
    pendingCargo: cargoOrders.length,
    prepManifest: computeDashboardManifest([...routeOrders, ...cargoOrders]),
  };
}
