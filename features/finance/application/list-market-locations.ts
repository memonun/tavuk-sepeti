import "server-only";

import { listMarketLocations as repoListMarketLocations } from "@/features/finance/infrastructure/market-location.repository";
import { AppError } from "@/shared/errors/app-error";

import type { MarketLocation } from "@/features/finance/domain/market-location";
import type { Result } from "@/shared/result";

export async function listMarketLocations(): Promise<Result<MarketLocation[], AppError>> {
  return repoListMarketLocations();
}
