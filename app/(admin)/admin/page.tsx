import { countActiveCustomers } from "@/features/customers/application/count-active-customers";
import { getDashboardOrderStats } from "@/features/orders/application/get-dashboard-order-stats";

export default async function DashboardHome() {
  const [orderStats, activeCustomers] = await Promise.all([
    getDashboardOrderStats(),
    countActiveCustomers(),
  ]);

  const cards = [
    { title: "Bekleyen Sipariş", value: orderStats.pendingOrders },
    { title: "Elden Teslimat (bugün)", value: orderStats.todayHandDeliveries },
    { title: "Kargo (bekleyen)", value: orderStats.pendingCargo },
    { title: "Aktif Müşteri", value: activeCustomers },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Panel</h2>
        <p className="text-sm text-muted-foreground">Hoş geldin.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-lg border bg-card p-4 text-card-foreground"
          >
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {card.title}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
