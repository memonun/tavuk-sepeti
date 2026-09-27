/**
 * Pazar Cirosu / Lokasyona Göre Satış / Satılan Ürünler — sits above the Pazar
 * Satışları table, same period as the page's filter bar. "Satılan Ürünler" lists
 * every product sold at the stalls in the period, ranked by revenue (what the
 * RPC orders by) with its quantity+unit underneath. Revenue is 0 for a sale
 * recorded before 2026-09-27, when per-item pricing didn't exist yet — those
 * rows sort last, not missing, so an old, unpriced sale doesn't just vanish
 * from the list.
 */
import { formatTRY } from "@/shared/utils/money";
import {
  displayUnit,
  formatQuantity,
  type MarketProductOption,
} from "@/features/finance/domain/market-sale-products";
import { parsePiecesPerUnit } from "@/features/finance/domain/product-tally";
import { StatCard } from "@/features/finance/ui/stat-card";

import type { FinanceLocationRevenue } from "@/features/finance/domain/finance-summary";
import type { MarketTopProductRow } from "@/features/finance/application/get-market-report";

export function MarketReport({
  totalRevenueMinor,
  byLocation,
  topProducts,
  products,
}: {
  totalRevenueMinor: number;
  byLocation: readonly FinanceLocationRevenue[];
  topProducts: readonly MarketTopProductRow[];
  /** For each product's unit label. */
  products: readonly MarketProductOption[];
}) {
  const maxLocationMinor = Math.max(1, ...byLocation.map((r) => r.revenueMinor));
  const productByKey = new Map(products.map((p) => [p.key, p]));
  const unitOf = (key: string) => {
    const p = productByKey.get(key);
    return p ? displayUnit(p.unit_label, p.unit) : "";
  };
  // Revenue is the same currency for every product, so — unlike quantity — one
  // bar scale works across the whole list.
  const maxRevenueMinor = Math.max(1, ...topProducts.map((p) => p.total_revenue_minor));

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
        <h3 className="text-sm font-semibold">Satılan Ürünler</h3>
        <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
          {topProducts.map((p) => {
            const quantity = Number(p.total_quantity);
            const unit = unitOf(p.product_key);
            const pieces = parsePiecesPerUnit(products.find((x) => x.key === p.product_key)?.unit_label ?? "");
            return (
              <div key={p.product_key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">{p.product_name}</span>
                  <span className="text-right font-medium tabular-nums">
                    {p.total_revenue_minor > 0 ? formatTRY(p.total_revenue_minor) : "—"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round((p.total_revenue_minor / maxRevenueMinor) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatQuantity(quantity)} {unit}
                  {pieces ? ` = ${(quantity * pieces).toLocaleString("tr-TR")} adet` : ""}
                </p>
              </div>
            );
          })}
          {topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bu dönemde kayıtlı satış yok.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
