/**
 * Pazar Cirosu / Lokasyona Göre Satış / En Çok Satılan Ürünler — sits above
 * the Pazar Satışları table, same period as the page's filter bar.
 */
import { formatTRY } from "@/shared/utils/money";
import { StatCard } from "@/features/finance/ui/stat-card";

import type { FinanceLocationRevenue } from "@/features/finance/domain/finance-summary";
import type { MarketTopProductRow } from "@/features/finance/application/get-market-report";

export function MarketReport({
  totalRevenueMinor,
  byLocation,
  topProducts,
}: {
  totalRevenueMinor: number;
  byLocation: readonly FinanceLocationRevenue[];
  topProducts: readonly MarketTopProductRow[];
}) {
  const maxLocationMinor = Math.max(1, ...byLocation.map((r) => r.revenueMinor));
  const maxQuantity = Math.max(1, ...topProducts.map((p) => p.total_quantity));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <StatCard title="Pazar Cirosu" value={formatTRY(totalRevenueMinor)} />

      <div className="rounded-lg border bg-card p-4 lg:col-span-1">
        <h3 className="text-sm font-semibold">Lokasyona Göre Satış</h3>
        <div className="mt-3 space-y-3">
          {byLocation.map((loc) => (
            <div key={loc.locationId} className="space-y-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">{loc.locationName}</span>
                <span className="font-medium tabular-nums">{formatTRY(loc.revenueMinor)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round((loc.revenueMinor / maxLocationMinor) * 100)}%` }}
                />
              </div>
            </div>
          ))}
          {byLocation.length === 0 ? (
            <p className="text-sm text-muted-foreground">Kayıtlı lokasyon yok.</p>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 lg:col-span-1">
        <h3 className="text-sm font-semibold">En Çok Satılan Ürünler</h3>
        <div className="mt-3 space-y-3">
          {topProducts.map((p) => (
            <div key={p.product_key} className="space-y-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">{p.product_name}</span>
                <span className="font-medium tabular-nums">{p.total_quantity}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round((p.total_quantity / maxQuantity) * 100)}%` }}
                />
              </div>
            </div>
          ))}
          {topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bu dönemde kayıtlı satış yok.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
