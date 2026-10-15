import { ChevronRight, PackageIcon, TruckIcon } from "lucide-react";
import Link from "next/link";

import { getRecurringExpenseOverview } from "@/features/finance/application/get-recurring-expense-overview";
import { materializeDueRecurringExpenses } from "@/features/finance/application/materialize-due-recurring-expenses";
import { RecurringExpenseOverviewPanel } from "@/features/finance/ui/recurring-expense-overview-panel";
import { countActiveCustomers } from "@/features/customers/application/count-active-customers";
import { getDashboardOrderStats } from "@/features/orders/application/get-dashboard-order-stats";
import { DashboardOrderListPanel } from "@/features/orders/ui/dashboard-order-list-panel";
import { DashboardPrepPanel } from "@/features/orders/ui/dashboard-prep-panel";
import { formatLongDate, todayInIstanbul } from "@/shared/utils/date";

export default async function DashboardHome() {
  // Lazy materialization, same as the Finans pages (no cron — spec §14): this
  // is the landing page, so this month's rutin giderler are generated the
  // first time anyone opens the panel in a new month. It must finish BEFORE
  // the recurring-expense overview is read, so the two are chained — but the
  // order and customer counts don't touch expenses and start alongside.
  const today = todayInIstanbul();
  const [orderStats, activeCustomers, recurringOverview] = await Promise.all([
    getDashboardOrderStats(),
    countActiveCustomers(),
    materializeDueRecurringExpenses(today).then(() => getRecurringExpenseOverview(today)),
  ]);

  // Each tile opens the screen where that work is done.
  const cards = [
    // Every order not yet delivered/cancelled, both channels — not just
    // status="pending" (the old tile hid confirmed/shipped orders that are
    // just as unfinished).
    { title: "Teslim edilmemiş sipariş", value: orderStats.undeliveredOrders, href: "/orders" },
    // Scheduled for today and not yet delivered — what's due out with the van
    // today, not a count of what's already been delivered.
    { title: "Bugün teslim edilecek", value: orderStats.prepManifest.route.orderCount, href: "/routes" },
    // The cargo backlog has no date scope (see dashboard-manifest.ts) — kept
    // as its own tile rather than folded into "today" above.
    { title: "Bekleyen kargo", value: orderStats.prepManifest.cargo.orderCount, href: "/kargo" },
    { title: "Aktif müşteri", value: activeCustomers, href: "/customers" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Panel</h2>
        <p className="text-sm text-muted-foreground">{formatLongDate(new Date())}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="group flex min-h-28 flex-col justify-between rounded-2xl border bg-card p-4 text-card-foreground shadow-(--admin-shadow-sm) admin-pressable"
          >
            <p className="text-4xl leading-none font-semibold tabular-nums">{card.value}</p>
            <p className="flex items-end justify-between gap-1 text-sm leading-tight font-medium text-muted-foreground">
              <span>{card.title}</span>
              <ChevronRight className="size-4 shrink-0" aria-hidden />
            </p>
          </Link>
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
