/**
 * One scope of the Panel's prep manifest ("Bugünkü Rota" / "Bekleyen Kargo")
 * as its own card: the individual orders behind the number — order no,
 * customer, amount, and what's in each one — not just a total. Takes the wide
 * column of the Panel; DashboardPrepPanel's combined product list is the
 * narrow sidebar beside it.
 */
import { formatTRY } from "@/shared/utils/money";

import type { ComponentType } from "react";
import type {
  DashboardManifestItem,
  DashboardManifestOrder,
  DashboardManifestTotals,
} from "@/features/orders/domain/dashboard-manifest";

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

/** "2 × Yumurta · 1 × Kuru Kayısı" — just the count and the product name. The
 *  unit label is dropped here: for Yumurta it's "paket (15 adet)", which
 *  repeated on every line read like a hardcoded "15". */
function itemLine(items: readonly DashboardManifestItem[]): string {
  return items.map((i) => `${formatQty(i.quantity)} × ${i.label}`).join(" · ");
}

export function DashboardOrderListPanel({
  title,
  icon: Icon,
  orders,
  totals,
  emptyLabel,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  orders: readonly DashboardManifestOrder[];
  totals: DashboardManifestTotals;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-1.5 border-b px-3 py-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </div>

      {orders.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="max-h-96 divide-y divide-border/60 overflow-y-auto px-3 text-sm">
          {orders.map((order) => {
            const unpaid = order.amount_paid_minor < order.total_minor;
            const items = itemLine(order.items);
            return (
              <li key={order.order_id} className="flex flex-col gap-0.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-xs text-muted-foreground">
                      {order.order_number}
                    </span>{" "}
                    {order.customer_name}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="font-medium tabular-nums">
                      {formatTRY(order.total_minor)}
                    </span>
                    {unpaid ? (
                      <span className="ml-1.5 text-xs text-destructive">
                        tahsil edilecek
                      </span>
                    ) : null}
                  </span>
                </div>
                {items ? (
                  <p className="text-xs text-muted-foreground">{items}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
        <span>{totals.orderCount} sipariş</span>
        {totals.totalValueMinor > 0 ? (
          <span>· {formatTRY(totals.totalValueMinor)} hasılat</span>
        ) : null}
        {totals.toCollectMinor > 0 ? (
          <span>· {formatTRY(totals.toCollectMinor)} tahsil edilecek</span>
        ) : null}
      </div>
    </div>
  );
}
