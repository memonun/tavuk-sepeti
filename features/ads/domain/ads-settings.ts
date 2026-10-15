/**
 * The owner's spending limits for Meta ad automation (single row,
 * `meta_ads_settings`, edited on /reklam).
 *
 * Every budget or status change re-reads these from the database right before
 * it calls Meta — the limits are enforced by the server, never left to the
 * model's judgement. Owner's decision of 2026-10-15: total daily cap 1.500 ₺,
 * at most +50% per change, apply automatically within the limits and report.
 *
 * Money is kuruş (CLAUDE.md §7).
 */
import { z } from "zod";

export interface AdsSettings {
  /** Off = no budget or status change of any kind ("acil durdur"). */
  readonly automationEnabled: boolean;
  /** The sum of active daily budgets may not exceed this (kuruş). */
  readonly dailyCapMinor: number;
  /** One change may raise a budget by at most this many percent. */
  readonly maxIncreasePct: number;
  /** Changes allowed per campaign/ad set per Istanbul day. */
  readonly maxChangesPerEntityPerDay: number;
}

/** Used when the row cannot be read: automation OFF, so a DB blip never spends. */
export const FALLBACK_ADS_SETTINGS: AdsSettings = {
  automationEnabled: false,
  dailyCapMinor: 0,
  maxIncreasePct: 50,
  maxChangesPerEntityPerDay: 2,
};

/** 100.000 ₺/day — far past this farm's budget; stops a typo with extra zeros. */
export const MAX_DAILY_CAP_MINOR = 10_000_000;

/** The row as stored (snake_case), and the admin form's payload. */
export const adsSettingsSchema = z.object({
  automation_enabled: z.preprocess(
    (value) => value === true || value === "on" || value === "true",
    z.boolean(),
  ),
  daily_cap_minor: z.coerce
    .number()
    .int("Tavan tam kuruş olmalı.")
    .min(0, "Tavan negatif olamaz.")
    .max(MAX_DAILY_CAP_MINOR, "Tavan en fazla 100.000 ₺ olabilir."),
  max_increase_pct: z.coerce
    .number()
    .int("Yüzde tam sayı olmalı.")
    .min(1, "Artış sınırı en az %1 olmalı.")
    .max(500, "Artış sınırı en fazla %500 olabilir."),
  max_changes_per_entity_per_day: z.coerce
    .number()
    .int()
    .min(1, "Günde en az 1 değişikliğe izin verilmeli.")
    .max(20, "Günde en fazla 20 değişiklik seçilebilir."),
});

export type AdsSettingsParsed = z.infer<typeof adsSettingsSchema>;

export function toAdsSettings(row: AdsSettingsParsed): AdsSettings {
  return {
    automationEnabled: row.automation_enabled,
    dailyCapMinor: row.daily_cap_minor,
    maxIncreasePct: row.max_increase_pct,
    maxChangesPerEntityPerDay: row.max_changes_per_entity_per_day,
  };
}
