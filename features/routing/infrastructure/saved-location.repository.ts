import "server-only";

/**
 * Reads saved start locations. The `saved_locations` table isn't in the
 * generated Database type yet (added by migration 20260612180000), so the
 * Supabase calls are cast until `pnpm db:types` regenerates.
 */
import {
  savedLocationSchema,
  type CreateSavedLocationInput,
  type SavedLocation,
} from "@/features/routing/domain/saved-location";
import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/** All saved locations, default first then alphabetical. */
export async function listSavedLocations(): Promise<
  Result<SavedLocation[], ExternalApiError>
> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("saved_locations")
    .select("id, name, lat, lng, is_default")
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_saved_locations_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const rows: SavedLocation[] = [];
  for (const raw of (data ?? []) as unknown[]) {
    const parsed = savedLocationSchema.safeParse(raw);
    if (parsed.success) rows.push(parsed.data);
  }
  return ok(rows);
}

/** The default saved location, or null if none is configured. */
export async function getDefaultSavedLocation(): Promise<SavedLocation | null> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("saved_locations")
    .select("id, name, lat, lng, is_default")
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const parsed = savedLocationSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/**
 * Exact-coordinate lookup — used to avoid re-inserting the same manually
 * picked address every time it's chosen again as a route destination.
 * Coordinates come from the same Google Places result each time the same
 * place is re-picked, so exact equality is a reasonable dedupe key here
 * (unlike geocoded-by-hand addresses, which can drift by a few decimals).
 */
export async function findSavedLocationByCoordinate(
  lat: number,
  lng: number,
): Promise<SavedLocation | null> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("saved_locations")
    .select("id, name, lat, lng, is_default")
    .eq("lat", lat)
    .eq("lng", lng)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const parsed = savedLocationSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Insert a new saved location (never as the default — see the schema doc). */
export async function createSavedLocation(
  input: CreateSavedLocationInput,
): Promise<Result<SavedLocation, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("saved_locations")
    .insert({ name: input.name, lat: input.lat, lng: input.lng, is_default: false })
    .select("id, name, lat, lng, is_default")
    .single();

  if (error) {
    logger.error({ code: error.code, message: error.message }, "create_saved_location_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const parsed = savedLocationSchema.safeParse(data);
  if (!parsed.success) {
    return err(new ExternalApiError({ message: "Kaydedilen konum okunamadı." }));
  }
  return ok(parsed.data);
}
