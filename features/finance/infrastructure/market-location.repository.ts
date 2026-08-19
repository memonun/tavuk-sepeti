import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { MarketLocation } from "@/features/finance/domain/market-location";

type MarketLocationRow = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
};

function rowToLocation(row: MarketLocationRow): MarketLocation {
  return { id: row.id, name: row.name, active: row.active, created_at: new Date(row.created_at) };
}

export async function listMarketLocations(
  includeInactive = false,
): Promise<Result<MarketLocation[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let builder = (supabase as any)
    .from("market_locations")
    .select("id, name, active, created_at")
    .order("name", { ascending: true });
  if (!includeInactive) builder = builder.eq("active", true);

  const { data, error } = await builder;
  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_market_locations_failed");
    return err(new ExternalApiError({ message: "Pazar lokasyonları yüklenemedi.", cause: error }));
  }
  return ok(((data ?? []) as MarketLocationRow[]).map(rowToLocation));
}

export async function createMarketLocation(
  name: string,
): Promise<Result<string, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("market_locations")
    .insert({ name })
    .select("id")
    .single();
  if (error) {
    logger.error({ code: error.code, message: error.message }, "create_market_location_failed");
    return err(new ExternalApiError({ message: "Lokasyon eklenemedi.", cause: error }));
  }
  return ok((data as { id: string }).id);
}
