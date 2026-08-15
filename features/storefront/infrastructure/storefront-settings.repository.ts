import "server-only";

/**
 * Read / write the single `storefront_settings` row (migration 20260813120000).
 *
 * Two clients on purpose:
 *
 *   - READ uses the service-role client. It is called from inside
 *     `unstable_cache`, which forbids dynamic data sources (cookies, the SSR
 *     client's session) in its scope — a cookie-bound read there would make the
 *     cache key drift per user. The row is public config (the checkout prints
 *     it to anonymous visitors), so bypassing RLS for it leaks nothing.
 *   - WRITE uses the ordinary cookie-bound client, so the admin RLS policy is a
 *     real backstop underneath `assertAdmin()` at the action boundary.
 *
 * The row is parsed with the same Zod schema the admin form uses (CLAUDE.md
 * §3/§4): a hand-edited row is an outer boundary too.
 */
import {
  storefrontSettingsSchema,
  toStorefrontSettings,
  type StorefrontSettings,
  type StorefrontSettingsParsed,
} from "@/features/storefront/domain/storefront-settings";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";
import { createSupabaseServerClient } from "@/shared/supabase/server";

const TABLE = "storefront_settings";
const SINGLETON_ID = true;

/**
 * `storefront_settings` post-dates the generated `Database` type, so the table
 * is not in it yet. This is the repo's documented cast for a not-yet-generated
 * schema object (see service-area.repository.ts); it disappears on the next
 * `pnpm db:types`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type LooseClient = { from: (table: string) => any };
/* eslint-enable @typescript-eslint/no-explicit-any */

export type StorefrontSettingsRead =
  | { readonly kind: "row"; readonly settings: StorefrontSettings }
  /** The row could not be read or failed validation. Caller falls back to the
   *  launch defaults — a DB blip must not close the shop. */
  | { readonly kind: "unavailable" };

export async function fetchStorefrontSettings(): Promise<StorefrontSettingsRead> {
  const supabase = getSupabaseAdminClient() as unknown as LooseClient;

  const { data, error } = await supabase
    .from(TABLE)
    .select("home_delivery_days, cargo_min_order_minor, home_min_order_minor")
    .eq("id", SINGLETON_ID)
    .maybeSingle();

  if (error) {
    logger.warn(
      { code: error.code, message: error.message },
      "storefront_settings_read_failed",
    );
    return { kind: "unavailable" };
  }
  if (!data) {
    // Seeded by the migration; missing means someone deleted it.
    logger.warn({}, "storefront_settings_row_missing");
    return { kind: "unavailable" };
  }

  const parsed = storefrontSettingsSchema.safeParse(data);
  if (!parsed.success) {
    logger.error(
      { issues: parsed.error.issues.map((i) => i.path.join(".")) },
      "storefront_settings_row_invalid",
    );
    return { kind: "unavailable" };
  }

  return { kind: "row", settings: toStorefrontSettings(parsed.data) };
}

export async function saveStorefrontSettings(
  values: StorefrontSettingsParsed,
  actorId: string,
): Promise<Result<StorefrontSettings, AppError>> {
  const supabase = (await createSupabaseServerClient()) as unknown as LooseClient;

  const { data, error } = await supabase
    .from(TABLE)
    .update({
      home_delivery_days: values.home_delivery_days,
      cargo_min_order_minor: values.cargo_min_order_minor,
      home_min_order_minor: values.home_min_order_minor,
      updated_by: actorId,
    })
    .eq("id", SINGLETON_ID)
    .select("home_delivery_days, cargo_min_order_minor, home_min_order_minor")
    .maybeSingle();

  if (error) {
    logger.error(
      { code: error.code, message: error.message },
      "storefront_settings_write_failed",
    );
    return err(
      new AppError(ErrorCode.DATABASE_ERROR, {
        message: "Ayarlar kaydedilemedi.",
        cause: error,
      }),
    );
  }
  if (!data) {
    // No row updated → RLS refused the write, or the singleton row is gone.
    return err(
      new ValidationError({
        message: "Ayar kaydı bulunamadı veya bu işlem için yetkiniz yok.",
      }),
    );
  }

  const parsed = storefrontSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return err(
      new AppError(ErrorCode.DATABASE_ERROR, {
        message: "Ayarlar kaydedildi ancak geri okunamadı.",
      }),
    );
  }

  return ok(toStorefrontSettings(parsed.data));
}
