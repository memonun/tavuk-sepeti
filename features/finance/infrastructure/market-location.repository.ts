import "server-only";

import { AppError, ExternalApiError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { MarketLocation } from "@/features/finance/domain/market-location";

/** Postgres foreign_key_violation — market_sales.location_id is `on delete
 *  restrict` (20260819210100_finance_market_sales.sql), so this is exactly
 *  "this location has recorded sales" rather than a generic DB failure. */
const FOREIGN_KEY_VIOLATION = "23503";

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

/** Hard-deletes a location with zero recorded sales. A location that HAS
 *  sales is blocked by the FK (on delete restrict) — that case surfaces as
 *  a CONFLICT so the UI can offer "pasife al" instead, matching the
 *  products archive-not-delete convention. */
export async function deleteMarketLocation(
  id: string,
): Promise<Result<void, AppError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("market_locations").delete().eq("id", id);

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return err(
        new AppError(ErrorCode.CONFLICT, {
          message: "Bu lokasyonda kayıtlı satış var, silinemez. Bunun yerine pasife alabilirsiniz.",
          cause: error,
        }),
      );
    }
    logger.error({ code: error.code, message: error.message }, "delete_market_location_failed");
    return err(new ExternalApiError({ message: "Lokasyon silinemedi.", cause: error }));
  }
  return ok(undefined);
}

export async function setMarketLocationActive(
  id: string,
  active: boolean,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("market_locations")
    .update({ active })
    .eq("id", id);

  if (error) {
    logger.error({ code: error.code, message: error.message }, "set_market_location_active_failed");
    return err(new ExternalApiError({ message: "Lokasyon durumu güncellenemedi.", cause: error }));
  }
  return ok(undefined);
}
