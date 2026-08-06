import "server-only";

/**
 * The signed-in customer's saved delivery addresses.
 *
 * Read through the ordinary cookie-bound client: `addresses_self_select` RLS
 * scopes the rows to the caller's own customer, so there is no customer_id
 * filter here and no service-role escalation.
 *
 * The pin fields come back too — the account editor re-renders the map at the
 * saved coordinate, and the checkout picker needs to know whether an address is
 * route-capable before the customer commits to it.
 */
import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { CoordinateAccuracy, CoordinateSource } from "@/shared/geo/coordinate";

export interface SavedAddress {
  id: string;
  label: string | null;
  city: string;
  district: string;
  neighborhood: string;
  street: string;
  building_no: string;
  apartment_no: string;
  postal_code: string;
  description: string;
  raw_text: string;
  lat: number;
  lng: number;
  accuracy: CoordinateAccuracy;
  source: CoordinateSource;
  is_primary: boolean;
  /** Whether the pin was checked against the delivery zone when it was saved. */
  geo_verified: boolean;
}

const ADDRESS_SELECT =
  "id, label, city, district, neighborhood, street, building_no, apartment_no, postal_code, description, raw_text, lat, lng, accuracy, source, is_primary, geo_verified_at" as const;

export async function listMyAddresses(): Promise<
  Result<SavedAddress[], ExternalApiError>
> {
  const supabase = await createSupabaseServerClient();

  // `label` / `geo_verified_at` are not in the generated Database type yet
  // (migration 20260805090100) — the repo's un-generated-column cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("addresses")
    .select(ADDRESS_SELECT)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    logger.error(
      { code: error.code, message: error.message },
      "list_customer_addresses_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return ok(
    rows.map((row) => ({
      id: String(row.id),
      label: typeof row.label === "string" ? row.label : null,
      city: str(row.city),
      district: str(row.district),
      neighborhood: str(row.neighborhood),
      street: str(row.street),
      building_no: str(row.building_no),
      apartment_no: str(row.apartment_no),
      postal_code: str(row.postal_code),
      description: str(row.description),
      raw_text: str(row.raw_text),
      lat: Number(row.lat ?? 0),
      lng: Number(row.lng ?? 0),
      accuracy: (row.accuracy as CoordinateAccuracy) ?? "unknown",
      source: (row.source as CoordinateSource) ?? "user_pin",
      is_primary: row.is_primary === true,
      geo_verified: row.geo_verified_at != null,
    })),
  );
}

/** Nullable text columns render as empty strings in the forms. */
function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
