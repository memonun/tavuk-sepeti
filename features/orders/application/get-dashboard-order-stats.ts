import {
  countPendingCargo,
  countPendingOrders,
  countTodayHandDeliveries,
} from "@/features/orders/infrastructure/order.repository";

export interface OrderDashboardStats {
  readonly pendingOrders: number;
  readonly todayHandDeliveries: number;
  readonly pendingCargo: number;
}

export async function getDashboardOrderStats(): Promise<OrderDashboardStats> {
  const [pendingOrders, todayHandDeliveries, pendingCargo] = await Promise.all([
    countPendingOrders(),
    countTodayHandDeliveries(),
    countPendingCargo(),
  ]);
  return { pendingOrders, todayHandDeliveries, pendingCargo };
}
