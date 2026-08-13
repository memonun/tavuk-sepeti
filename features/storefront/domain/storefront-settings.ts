/**
 * Owner-editable storefront rules.
 *
 * Two things the owner asked to be able to change without a deploy:
 *
 *   - `homeDeliveryDays` — the days the van goes out ("eve servis günleri").
 *     Wednesday + Saturday today, and explicitly "değiştirebileyim" tomorrow.
 *   - `cargoMinOrderMinor` — the floor for an out-of-city (cargo) order.
 *     1.000 ₺ at launch; a shipping cost that moves would move this too.
 *
 * They live in a single `storefront_settings` row rather than in this file
 * because a constant is only "changeable" by a developer. The DEFAULTS below
 * are what the storefront falls back to when the row cannot be read — a
 * database blip must degrade to the launch rules, never to "no rules at all",
 * which is the shape CLAUDE.md §1 asks for.
 *
 * Money is minor units (kuruş) per CLAUDE.md §7.
 */
import { z } from "zod";

import {
  DEFAULT_HOME_DELIVERY_DAYS,
  sortWeekdays,
  type Weekday,
} from "@/features/storefront/domain/delivery-window";

export interface StorefrontSettings {
  /** Days the van drives, 0=Sunday…6=Saturday. Never empty. */
  readonly homeDeliveryDays: readonly Weekday[];
  /** Minimum subtotal (kuruş) for a cargo order. 0 disables the floor. */
  readonly cargoMinOrderMinor: number;
}

/** 1.000 ₺ — the out-of-city order floor the owner set (2026-08-13). */
export const DEFAULT_CARGO_MIN_ORDER_MINOR = 100_000;

export const DEFAULT_STOREFRONT_SETTINGS: StorefrontSettings = {
  homeDeliveryDays: DEFAULT_HOME_DELIVERY_DAYS,
  cargoMinOrderMinor: DEFAULT_CARGO_MIN_ORDER_MINOR,
};

/** Guard rail on the admin form: 100.000 ₺ is far past any real basket. */
const MAX_CARGO_MIN_ORDER_MINOR = 10_000_000;

const weekdaySchema = z
  .coerce.number()
  .int("Gün değeri tam sayı olmalı.")
  .min(0)
  .max(6)
  .transform((day) => day as Weekday);

/**
 * The write shape — used by the admin Server Action AND by the repository when
 * it reads the row back, so a hand-edited database row is held to the same
 * rules as the form (CLAUDE.md §3: everything from an outer boundary is parsed).
 *
 * At least one delivery day is mandatory: zero days would silently close the
 * fresh-product checkout with no explanation anywhere in the UI.
 */
export const storefrontSettingsSchema = z.object({
  home_delivery_days: z
    .array(weekdaySchema)
    .min(1, "En az bir eve servis günü seçin.")
    .max(7)
    // De-duplicate + order Monday-first so the stored row is canonical and two
    // equivalent selections can never read back differently.
    .transform((days) => sortWeekdays(days)),
  cargo_min_order_minor: z.coerce
    .number()
    .int("Alt limit kuruş cinsinden tam sayı olmalı.")
    .min(0, "Alt limit negatif olamaz.")
    .max(MAX_CARGO_MIN_ORDER_MINOR, "Alt limit çok yüksek."),
});

export type StorefrontSettingsInput = z.input<typeof storefrontSettingsSchema>;
export type StorefrontSettingsParsed = z.output<typeof storefrontSettingsSchema>;

/** DB/parsed row → domain entity (CLAUDE.md §3: the domain never sees a row). */
export function toStorefrontSettings(
  parsed: StorefrontSettingsParsed,
): StorefrontSettings {
  return {
    homeDeliveryDays: parsed.home_delivery_days,
    cargoMinOrderMinor: parsed.cargo_min_order_minor,
  };
}
