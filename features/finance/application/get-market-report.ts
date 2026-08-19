import "server-only";

/** Powers the Pazar Cirosu / Lokasyona Göre Satış / En Çok Satılan Ürünler
 *  section at the top of the Pazar Satışları page. */
import {
  financeMarketRevenue,
  financeMarketTopProducts,
} from "@/features/finance/infrastructure/finance-reporting.repository";
import { AppError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import type { FinanceLocationRevenue } from "@/features/finance/domain/finance-summary";
import type { MarketTopProductRow } from "@/features/finance/infrastructure/finance-reporting.repository";

export interface MarketReport {
  totalRevenueMinor: number;
  byLocation: FinanceLocationRevenue[];
  topProducts: MarketTopProductRow[];
}

/** Re-exported so feature-ui can type against this without reaching into
 *  infrastructure directly (eslint-plugin-boundaries: feature-ui may only
 *  import its own application/domain + other features' application). */
export type { MarketTopProductRow };

export async function getMarketReport(
  from: string,
  to: string,
): Promise<Result<MarketReport, AppError>> {
  const [revenueRes, topProductsRes] = await Promise.all([
    financeMarketRevenue(from, to),
    financeMarketTopProducts(from, to, 10),
  ]);
  if (!revenueRes.ok) return err(revenueRes.error);
  if (!topProductsRes.ok) return err(topProductsRes.error);

  const byLocation = revenueRes.value.map((row) => ({
    locationId: row.location_id,
    locationName: row.location_name,
    revenueMinor: row.revenue_minor,
    saleCount: row.sale_count,
  }));

  return ok({
    totalRevenueMinor: byLocation.reduce((acc, r) => acc + r.revenueMinor, 0),
    byLocation,
    topProducts: topProductsRes.value,
  });
}
