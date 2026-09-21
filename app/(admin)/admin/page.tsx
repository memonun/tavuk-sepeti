import { PackageIcon, TruckIcon } from "lucide-react";

import { getRecurringExpenseOverview } from "@/features/finance/application/get-recurring-expense-overview";
import { materializeDueRecurringExpenses } from "@/features/finance/application/materialize-due-recurring-expenses";
import { RecurringExpenseOverviewPanel } from "@/features/finance/ui/recurring-expense-overview-panel";
import { countActiveCustomers } from "@/features/customers/application/count-active-customers";
import { getDashboardOrderStats } from "@/features/orders/application/get-dashboard-order-stats";
import { DashboardOrderListPanel } from "@/features/orders/ui/dashboard-order-list-panel";
import { DashboardPrepPanel } from "@/features/orders/ui/dashboard-prep-panel";
import { todayInIstanbul } from "@/shared/utils/date";

export default async function DashboardHome() {
  // Lazy materialization, same as the Finans pages (no cron — spec §14): this
  // is the landing page, so this month's rutin giderler are generated the
  // first time anyone opens the panel in a new month. Must finish BEFORE the
  // overview is read, so it isn't part of the Promise.all below.
  const today = todayInIstanbul();
  await materializeDueRecurringExpenses(today);

  const [orderStats, activeCustomers, recurringOverview] = await Promise.all([
    getDashboardOrderStats(),
    countActiveCustomers(),
    getRecurringExpenseOverview(today),
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

      {/* Order lists take the wide column; the combined product prep list is
          the narrow sidebar. */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
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
        <DashboardPrepPanel manifest={orderStats.prepManifest} />
      </div>

      {recurringOverview.ok ? (
        <RecurringExpenseOverviewPanel overview={recurringOverview.value} />
      ) : (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-4 text-sm text-destructive">
          Yaklaşan rutin giderler yüklenemedi: {recurringOverview.error.message}
        </div>
      )}
    </div>
  );
}
