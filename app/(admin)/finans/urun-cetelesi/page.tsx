/**
 * Ürün Çetelesi — satılan vs. elden çıkarılan (hediye) ürün toplamları,
 * seçilen dönem için. Period handling copies app/(admin)/finans/page.tsx
 * exactly (same query params, same FinancePeriodFilter) so switching
 * between Finans tabs keeps the same period selected.
 */
import {
  getFinanceDateRangeBounds,
  isFinanceDateRangePreset,
} from "@/features/finance/application/date-range-presets";
import { getProductTally } from "@/features/finance/application/get-product-tally";
import { FinancePeriodFilter } from "@/features/finance/ui/finance-period-filter";
import { getProductTallyOrders } from "@/features/finance/application/get-product-tally-orders";
import {
  parsePageParam,
  parseProductOrdersKind,
} from "@/features/finance/domain/product-tally-orders";
import { ProductTallyCharts } from "@/features/finance/ui/product-tally-charts";
import {
  PRODUCT_ORDERS_ANCHOR,
  ProductTallyOrdersPanel,
} from "@/features/finance/ui/product-tally-orders-panel";
import { ProductTallyTable } from "@/features/finance/ui/product-tally-table";

interface UrunCetelesiPageProps {
  searchParams: Promise<{
    range?: string;
    date_basis?: string;
    date_from?: string;
    date_to?: string;
    /** Product whose orders are expanded under the table. */
    product?: string;
    /** "sold" | "gift" tab of that panel. */
    kind?: string;
    orders_page?: string;
  }>;
}

export default async function UrunCetelesiPage({ searchParams }: UrunCetelesiPageProps) {
  const params = await searchParams;
  const preset = isFinanceDateRangePreset(params.range) ? params.range : "this_month";
  const dateBasis = params.date_basis === "created_at" ? "created_at" : "scheduled_for";
  const bounds =
    preset === "custom" && params.date_from && params.date_to
      ? { from: params.date_from, to: params.date_to }
      : getFinanceDateRangeBounds(preset);

  const tallyResult = await getProductTally({ from: bounds.from, to: bounds.to, dateBasis });

  // Drill-down: only meaningful for a product that is actually in this
  // period's tally, so a stale/hand-typed ?product= is ignored, not queried.
  const selectedRow = tallyResult.ok
    ? tallyResult.value.find((r) => r.product_key === params.product)
    : undefined;
  const hasSold = !!selectedRow?.sold;
  const hasGift = (selectedRow?.gifted.length ?? 0) > 0;
  const requestedKind = parseProductOrdersKind(params.kind);
  const kind =
    requestedKind === "gift" && hasGift
      ? "gift"
      : requestedKind === "sold" && hasSold
        ? "sold"
        : hasSold
          ? "sold"
          : "gift";
  const ordersResult = selectedRow
    ? await getProductTallyOrders({
        from: bounds.from,
        to: bounds.to,
        dateBasis,
        productKey: selectedRow.product_key,
        kind,
        page: parsePageParam(params.orders_page),
      })
    : null;

  /** This page's URL with the given query keys overridden (null = removed). */
  const hrefFor = (overrides: Record<string, string | null>): string => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") next.set(key, value);
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const search = next.toString();
    return `/finans/urun-cetelesi${search ? `?${search}` : ""}#${PRODUCT_ORDERS_ANCHOR}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Ürün Çetelesi</h2>
        <p className="text-sm text-muted-foreground">
          Satılan ve elden çıkarılan (hediye) ürün toplamları.
        </p>
      </div>

      <FinancePeriodFilter />

      {tallyResult.ok ? (
        <>
          <ProductTallyCharts rows={tallyResult.value} />
          <ProductTallyTable
            rows={tallyResult.value}
            selectedKey={selectedRow?.product_key}
            hrefForProduct={(row) =>
              hrefFor({ product: row.product_key, kind: null, orders_page: null })
            }
          />
          {selectedRow && ordersResult ? (
            ordersResult.ok ? (
              <ProductTallyOrdersPanel
                productName={selectedRow.display_name}
                soldUnitLabel={selectedRow.sold?.unit_label ?? null}
                kind={kind}
                hasSold={hasSold}
                hasGift={hasGift}
                page={ordersResult.value}
                hrefFor={hrefFor}
              />
            ) : (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
                {ordersResult.error.message}
              </div>
            )
          ) : null}
        </>
      ) : (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
          Ürün çetelesi yüklenemedi: {tallyResult.error.message}
        </div>
      )}
    </div>
  );
}
