"use server";

/**
 * Server Action wrapper around the geocode pipeline so Client Components
 * (customer form's address field) can request a pin without exposing
 * Supabase / Google internals.
 *
 * Returns a plain serializable object — no AppError instances, no Date
 * objects (those don't always survive React's RSC payload).
 */
import { geocodeAddress } from "@/features/geocoding/application/geocode-address";
import type { CoordinateAccuracy, CoordinateSource } from "@/shared/geo/coordinate";

export type GeocodeAddressActionResult =
  | {
      ok: true;
      lat: number;
      lng: number;
      accuracy: CoordinateAccuracy;
      source: CoordinateSource;
      geocoderResponseHash: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export async function geocodeAddressAction(
  rawAddress: string,
): Promise<GeocodeAddressActionResult> {
  const result = await geocodeAddress(rawAddress);
  if (result.ok) {
    return {
      ok: true,
      lat: result.value.lat,
      lng: result.value.lng,
      accuracy: result.value.accuracy,
      source: result.value.source,
      geocoderResponseHash: result.value.geocoder_response_hash ?? "",
    };
  }
  return {
    ok: false,
    code: result.error.code,
    message: result.error.message,
  };
}
