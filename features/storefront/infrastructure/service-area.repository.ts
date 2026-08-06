/**
 * "Can the van reach this pin?" — the authoritative delivery-area check.
 *
 * Wraps the `is_within_service_area(lat, lng)` RPC, a PostGIS point-in-polygon
 * test against the `service_areas` table with a GIST index. It is deliberately
 * three-valued (see the migration): NULL means no zone has been configured at
 * all, which callers must handle by falling back to a province-name compare and
 * logging — coercing it to `false` would let one seeding mistake block every
 * route order.
 *
 * The function is SECURITY INVOKER and granted to `anon`, so this runs on the
 * ordinary cookie-bound client — no service-role escalation for a read that
 * leaks nothing (the zone is the delivery area we already advertise).
 */
import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { serviceAreaCheckFromRpc, type ServiceAreaCheck } from "@/shared/geo/service-area";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export type { ServiceAreaCheck };

export async function checkServiceArea(
  lat: number,
  lng: number,
): Promise<Result<ServiceAreaCheck, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();

  // Not in the generated Database type yet (added by migration 20260805090200)
  // — the repo's documented un-generated-RPC cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("is_within_service_area", {
    p_lat: lat,
    p_lng: lng,
  });

  if (error) {
    logger.error(
      { code: error.code, message: error.message },
      "service_area_check_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  return ok(serviceAreaCheckFromRpc(data as boolean | null));
}
