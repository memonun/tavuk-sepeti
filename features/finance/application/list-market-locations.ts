import "server-only";

import { listMarketLocations as repoListMarketLocations } from "@/features/finance/infrastructure/market-location.repository";
import { AppError } from "@/shared/errors/app-error";

import type { MarketLocation } from "@/features/finance/domain/market-location";
import type { Result } from "@/shared/result";

export async function listMarketLocations(): Promise<Result<MarketLocation[], AppError>> {
  return repoListMarketLocations();
}

/** Active + inactive — the location-management dialog needs to show
 *  archived locations too (so they can be reactivated), unlike every other
 *  caller which only ever wants the pickable/active set. */
export async function listAllMarketLocations(): Promise<Result<MarketLocation[], AppError>> {
  return repoListMarketLocations(true);
}
