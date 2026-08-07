"use server";

/**
 * Server Action wrapper around the reverse-geocode pipeline, so the address
 * form can turn a dropped pin into filled fields without touching Google or
 * Supabase internals.
 *
 * Sign-in is REQUIRED. A Server Action is a public HTTP endpoint no matter
 * which page calls it, and this one spends Google quota on every miss — left
 * open it is a free billing tap for anyone who finds the endpoint id
 * (CLAUDE.md §1/§10). Every surface that renders the address form is already
 * behind a session, so the check costs a real caller nothing.
 *
 * Returns a plain serializable object — no AppError instances, no Date
 * objects (those don't always survive React's RSC payload).
 */
import { z } from "zod";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { reverseGeocode } from "@/features/geocoding/application/reverse-geocode";
import { logger } from "@/shared/logger";

import type { CoordinateAccuracy } from "@/shared/geo/coordinate";
import type { ParsedAddress } from "@/shared/geo/tr-address-components";

const inputSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

export type ReverseGeocodeActionResult =
  | { ok: true; address: ParsedAddress; accuracy: CoordinateAccuracy }
  | { ok: false; code: string; message: string };

export async function reverseGeocodeAction(
  input: unknown,
): Promise<ReverseGeocodeActionResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Geçersiz konum.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      message: "Oturum bulunamadı, tekrar giriş yapın.",
    };
  }

  const result = await reverseGeocode(parsed.data.lat, parsed.data.lng);
  if (result.ok) {
    return {
      ok: true,
      address: result.value.address,
      accuracy: result.value.accuracy,
    };
  }

  // Never swallowed: the customer sees a soft message and keeps typing, but the
  // failure is on the record with its code (CLAUDE.md §5).
  logger.warn({ code: result.error.code }, "reverse_geocode_action_failed");
  return {
    ok: false,
    code: result.error.code,
    message: "Konumdan adres alınamadı — alanları elle doldurabilirsiniz.",
  };
}
