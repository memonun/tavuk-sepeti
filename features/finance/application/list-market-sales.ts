import "server-only";

import { marketSaleListQuerySchema } from "@/features/finance/domain/market-sale.schema";
import {
  findMarketSaleById as repoFindMarketSaleById,
  listMarketSales as repoListMarketSales,
} from "@/features/finance/infrastructure/market-sale.repository";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, type Result } from "@/shared/result";

import type { ListMarketSalesResult } from "@/features/finance/infrastructure/market-sale.repository";
import type { MarketSale } from "@/features/finance/domain/market-sale";

export type { MarketSale, MarketSaleListItem } from "@/features/finance/domain/market-sale";

export async function listMarketSales(
  rawQuery: unknown,
): Promise<Result<ListMarketSalesResult, AppError>> {
  const parsed = marketSaleListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.flatten() }, "list_market_sales_invalid_query");
    return err(
      new ValidationError({
        message: "Geçersiz arama parametresi.",
        details: parsed.error.flatten(),
      }),
    );
  }
  return repoListMarketSales(parsed.data);
}

export async function getMarketSaleById(id: string): Promise<Result<MarketSale, AppError>> {
  return repoFindMarketSaleById(id);
}
