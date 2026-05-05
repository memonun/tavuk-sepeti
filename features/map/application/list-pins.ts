import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { MapFilters, MapPin } from "@/features/map/domain/map-pin";

interface RpcRow {
  customer_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  // RPC returns status too, but we don't consume it — see MapPin docstring.
  status: string;
  lat: number;
  lng: number;
  has_recent_order: boolean;
}

/**
 * Fetch every active-customer pin for the map view. RLS still applies —
 * only authenticated admins see anything.
 *
 * The `get_customer_pins` RPC isn't yet in the auto-generated Database
 * type (Docker was down at last `pnpm db:types`); we cast the rpc()
 * return until the types regenerate.
 */
export async function listMapPins(
  filters: MapFilters,
): Promise<Result<MapPin[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_customer_pins", {
    filter_recent_orders: filters.recentOrdersOnly,
  });

  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_map_pins_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const rows = (data ?? []) as RpcRow[];
  return ok(
    rows.map((row) => ({
      customer_id: row.customer_id,
      first_name: row.first_name,
      last_name: row.last_name,
      phone: row.phone,
      lat: row.lat,
      lng: row.lng,
      has_recent_order: row.has_recent_order,
    })),
  );
}
