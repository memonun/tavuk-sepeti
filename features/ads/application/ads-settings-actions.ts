"use server";

/**
 * The /reklam page's limits form, and the history both the page and the
 * report read. Admin gate first, then Zod (CLAUDE.md §4/§10).
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { adsSettingsSchema, type AdsSettings } from "@/features/ads/domain/ads-settings";
import { listAdsChanges, type AdsChangeRow } from "@/features/ads/infrastructure/ads-changes.repository";
import { fetchAdsSettings, saveAdsSettings } from "@/features/ads/infrastructure/ads-settings.repository";
import { logAudit, SINGLETON_ENTITY_ID } from "@/shared/audit/log-audit";
import type { AppError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { ok, type Result } from "@/shared/result";
import { parseTRYInput } from "@/shared/utils/money";

export type UpdateAdsSettingsState =
  | { status: "idle" }
  | { status: "success"; savedAt: number }
  | { status: "error"; message: string };

export async function getAdsSettingsAction(): Promise<Result<AdsSettings, AppError>> {
  const admin = await assertAdmin();
  if (!admin.ok) return admin;
  return ok(await fetchAdsSettings());
}

export async function listAdsChangesAction(opts: { readonly limit?: number; readonly sinceIso?: string } = {}): Promise<Result<AdsChangeRow[], AppError>> {
  const admin = await assertAdmin();
  if (!admin.ok) return admin;
  return listAdsChanges(opts);
}

export async function updateAdsSettingsAction(
  _previous: UpdateAdsSettingsState,
  formData: FormData,
): Promise<UpdateAdsSettingsState> {
  const admin = await assertAdmin();
  if (!admin.ok) return { status: "error", message: admin.error.message };

  // The form takes lira ("1500" or "1500,00"); the row stores kuruş. A
  // thousands dot ("1.500") does not parse and is reported, never misread.
  const capText = formData.get("daily_cap_try");
  const capMinor = typeof capText === "string" ? parseTRYInput(capText) : null;
  if (capMinor === null) {
    return { status: "error", message: "Günlük tavan geçerli bir tutar olmalı (ör. 1500 ya da 1500,00; binlik nokta kullanmayın)." };
  }

  const parsed = adsSettingsSchema.safeParse({
    automation_enabled: formData.get("automation_enabled"),
    daily_cap_minor: capMinor,
    max_increase_pct: formData.get("max_increase_pct"),
    max_changes_per_entity_per_day: formData.get("max_changes_per_entity_per_day"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Geçersiz ayar değeri." };
  }

  const before = await fetchAdsSettings();
  const saved = await saveAdsSettings(parsed.data, admin.value.id);
  if (!saved.ok) {
    logger.error({ code: saved.error.code }, "meta_ads_settings_update_failed");
    return { status: "error", message: saved.error.message };
  }

  await logAudit({
    actor_id: admin.value.id,
    action: "meta_ads_settings.updated",
    entity_type: "meta_ads_settings",
    entity_id: SINGLETON_ENTITY_ID,
    before: { ...before },
    after: { ...saved.value },
  });

  revalidatePath("/reklam");
  return { status: "success", savedAt: Date.now() };
}

export type { AdsChangeRow };
