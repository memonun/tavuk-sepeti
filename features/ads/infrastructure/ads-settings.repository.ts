import "server-only";

/**
 * Read / write the single `meta_ads_settings` row and append to
 * `meta_ads_changes` (migration 20261015211425).
 *
 * Both use the cookie-bound client (the MCP route runs it as the verified
 * admin), so the admin-only RLS policies are a real backstop. Neither table is
 * in the generated Database type yet; same documented cast as
 * storefront-settings.repository.ts until the next `pnpm db:types`.
 */
import {
  adsSettingsSchema,
  FALLBACK_ADS_SETTINGS,
  toAdsSettings,
  type AdsSettings,
  type AdsSettingsParsed,
} from "@/features/ads/domain/ads-settings";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type LooseClient = { from: (table: string) => any };
/* eslint-enable @typescript-eslint/no-explicit-any */

const SETTINGS_COLUMNS = "automation_enabled, daily_cap_minor, max_increase_pct, max_changes_per_entity_per_day";

/** Unreadable row → automation OFF (FALLBACK_ADS_SETTINGS): a DB blip never spends. */
export async function fetchAdsSettings(): Promise<AdsSettings> {
  const supabase = (await createSupabaseServerClient()) as unknown as LooseClient;
  const { data, error } = await supabase.from("meta_ads_settings").select(SETTINGS_COLUMNS).eq("id", true).maybeSingle();
  if (error || !data) {
    logger.warn({ code: error?.code, missing: !data }, "meta_ads_settings_read_failed");
    return FALLBACK_ADS_SETTINGS;
  }
  const parsed = adsSettingsSchema.safeParse(data);
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues.map((issue) => issue.path.join(".")) }, "meta_ads_settings_row_invalid");
    return FALLBACK_ADS_SETTINGS;
  }
  return toAdsSettings(parsed.data);
}

export async function saveAdsSettings(values: AdsSettingsParsed, actorId: string): Promise<Result<AdsSettings, AppError>> {
  const supabase = (await createSupabaseServerClient()) as unknown as LooseClient;
  const { data, error } = await supabase
    .from("meta_ads_settings")
    .update({ ...values, updated_by: actorId })
    .eq("id", true)
    .select(SETTINGS_COLUMNS)
    .maybeSingle();

  if (error) {
    logger.error({ code: error.code, message: error.message }, "meta_ads_settings_write_failed");
    return err(new AppError(ErrorCode.DATABASE_ERROR, { message: "Reklam ayarları kaydedilemedi.", cause: error }));
  }
  if (!data) {
    return err(new ValidationError({ message: "Reklam ayar kaydı bulunamadı veya bu işlem için yetkiniz yok." }));
  }
  const parsed = adsSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return err(new AppError(ErrorCode.DATABASE_ERROR, { message: "Ayarlar kaydedildi ancak geri okunamadı." }));
  }
  return ok(toAdsSettings(parsed.data));
}
