import { Plus } from "lucide-react";

import { getFinanceDateRangeBounds } from "@/features/finance/application/date-range-presets";
import { getMarketReport } from "@/features/finance/application/get-market-report";
import { listMarketLocations } from "@/features/finance/application/list-market-locations";
import { listMarketSales } from "@/features/finance/application/list-market-sales";
import { MarketReport } from "@/features/finance/ui/market-report";
import { MarketSaleFilterBar } from "@/features/finance/ui/market-sale-filter-bar";
import { MarketSaleFormDialog } from "@/features/finance/ui/market-sale-form";
import { MarketSaleTable } from "@/features/finance/ui/market-sale-table";
import { listActiveProducts } from "@/features/products/application/list-products";
import { Button } from "@/components/ui/button";

interface PazarSatislariPageProps {
  searchParams: Promise<{
    location_id?: string;
    date_from?: string;
    date_to?: string;
    sort?: string;
    order?: string;
    page?: string;
  }>;
}

export default async function PazarSatislariPage({ searchParams }: PazarSatislariPageProps) {
  const params = await searchParams;
  const reportBounds = getFinanceDateRangeBounds("this_month");
  const reportFrom = params.date_from ?? reportBounds.from;
  const reportTo = params.date_to ?? reportBounds.to;

  const [salesResult, locationsResult, productsResult, reportResult] = await Promise.all([
    listMarketSales({
      location_id: params.location_id || undefined,
      date_from: params.date_from,
      date_to: params.date_to,
      sort: params.sort,
      order: params.order,
      page: params.page,
    }),
    listMarketLocations(),
    listActiveProducts(),
    getMarketReport(reportFrom, reportTo),
  ]);

  if (!salesResult.ok) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        Pazar satışları yüklenemedi: {salesResult.error.message}
      </div>
    );
  }

  const locations = locationsResult.ok ? locationsResult.value : [];
  const products = productsResult.ok
    ? productsResult.value.map((p) => ({ key: p.key, display_name: p.display_name }))
    : [];
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Pazar Satışları</h2>
          <p className="text-sm text-muted-foreground">
            İki pazar tezgahındaki nakit satışları kaydet ve raporla.
          </p>
        </div>
        <MarketSaleFormDialog
          mode="create"
          locations={locations}
          products={products}
          trigger={
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Pazar Satışı Ekle
            </Button>
          }
        />
      </div>

      {reportResult.ok ? (
        <MarketReport
          totalRevenueMinor={reportResult.value.totalRevenueMinor}
          byLocation={reportResult.value.byLocation}
          topProducts={reportResult.value.topProducts}
        />
      ) : null}

      <MarketSaleFilterBar locations={locations} />

      <MarketSaleTable
        items={salesResult.value.items}
        total={salesResult.value.total}
        page={salesResult.value.page}
        pageSize={salesResult.value.pageSize}
        basePath="/finans/pazar-satislari"
        query={query}
        locations={locations}
        products={products}
      />
    </div>
  );
}
