"use server";

/**
 * Persist a one-off manually-entered route destination to the saved-locations
 * address book, so picking the same errand address again next time is a
 * dropdown pick instead of a fresh Places search.
 *
 * Idempotent by coordinate: re-saving the same picked place reuses the
 * existing row rather than growing duplicates every time it's chosen again.
 */
import { assertAdmin } from "@/features/auth/application/assert-admin";
import {
  createSavedLocationSchema,
  type SavedLocation,
} from "@/features/routing/domain/saved-location";
import {
  createSavedLocation,
  findSavedLocationByCoordinate,
} from "@/features/routing/infrastructure/saved-location.repository";
import { ValidationError, type AppError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

export async function saveManualLocationAction(
  rawInput: unknown,
): Promise<Result<SavedLocation, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = createSavedLocationSchema.safeParse(rawInput);
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.issues }, "save_manual_location_invalid_input");
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz konum.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const existing = await findSavedLocationByCoordinate(parsed.data.lat, parsed.data.lng);
  if (existing) return ok(existing);

  return createSavedLocation(parsed.data);
}
