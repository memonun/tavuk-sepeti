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
import { ProductTallyCharts } from "@/features/finance/ui/product-tally-charts";
import { ProductTallyTable } from "@/features/finance/ui/product-tally-table";

interface UrunCetelesiPageProps {
  searchParams: Promise<{
    range?: string;
    date_basis?: string;
    date_from?: string;
    date_to?: string;
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
          <ProductTallyTable rows={tallyResult.value} />
        </>
      ) : (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
          Ürün çetelesi yüklenemedi: {tallyResult.error.message}
        </div>
      )}
    </div>
  );
}
