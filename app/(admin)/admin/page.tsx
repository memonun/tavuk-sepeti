import { PackageIcon, TruckIcon } from "lucide-react";

import { countActiveCustomers } from "@/features/customers/application/count-active-customers";
import { getDashboardOrderStats } from "@/features/orders/application/get-dashboard-order-stats";
import { DashboardOrderListPanel } from "@/features/orders/ui/dashboard-order-list-panel";
import { DashboardPrepPanel } from "@/features/orders/ui/dashboard-prep-panel";

export default async function DashboardHome() {
  const [orderStats, activeCustomers] = await Promise.all([
    getDashboardOrderStats(),
    countActiveCustomers(),
  ]);

  const cards = [
    // Every order not yet delivered/cancelled, both channels — not just
    // status="pending" (the old tile hid confirmed/shipped orders that are
    // just as unfinished).
    { title: "Teslim Edilmemiş Sipariş", value: orderStats.undeliveredOrders },
    // Scheduled for today and not yet delivered — what's due out with the van
    // today, not a count of what's already been delivered.
    { title: "Bugün Teslim Edilecek", value: orderStats.prepManifest.route.orderCount },
    // The cargo backlog has no date scope (see dashboard-manifest.ts) — kept
    // as its own tile rather than folded into "today" above.
    { title: "Kargo (bekleyen)", value: orderStats.prepManifest.cargo.orderCount },
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

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <DashboardPrepPanel manifest={orderStats.prepManifest} />
        <div className="flex flex-col gap-4">
          <DashboardOrderListPanel
            title="Bugünkü rota"
            icon={TruckIcon}
            orders={orderStats.prepManifest.routeOrders}
            totals={orderStats.prepManifest.route}
            emptyLabel="Bugün planlı rota siparişi yok."
          />
          <DashboardOrderListPanel
            title="Bekleyen kargo"
            icon={PackageIcon}
            orders={orderStats.prepManifest.cargoOrders}
            totals={orderStats.prepManifest.cargo}
            emptyLabel="Bekleyen kargo siparişi yok."
          />
        </div>
      </div>
    </div>
  );
}
