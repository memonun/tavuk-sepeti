/**
 * Owner-editable storefront rules.
 *
 * Three things the owner asked to be able to change without a deploy:
 *
 *   - `homeDeliveryDays` — the days the van goes out ("eve servis günleri").
 *     Wednesday + Saturday today, and explicitly "değiştirebileyim" tomorrow.
 *   - `cargoMinOrderMinor` — the floor for an out-of-city (cargo) order.
 *     1.000 ₺ at launch; a shipping cost that moves would move this too.
 *   - `homeMinOrderMinor` — the floor for a delivery-channel (eve servis)
 *     order, including a basket the address-aware channel resolution upgrades
 *     from shipping (migration 20260813130000). 250 ₺ at launch.
 *   - `homeDeliveryFeeMinor` — the flat fee on a delivery-channel (eve servis)
 *     order: storefront checkout, the recurring generator and, as the default,
 *     staff-entered orders (migration 20260919120000). 50 ₺ at launch.
 *   - `cargoFeeMinor` — the flat fee on a cargo (şehir dışı) storefront order
 *     (migration 20261022135852). 150 ₺ as of 2026-10-22.
 *   - `cargoFreeShippingThresholdMinor` — a cargo order whose subtotal reaches
 *     this pays no cargo fee. 1.000 ₺ as of 2026-10-22; 0 = no threshold.
 *   - `heroTitle` / `heroSubtitle` — the home page heading and the sentence
 *     under it (migration 20261026200332). Owner asked 2026-10-26.
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
  /** Minimum subtotal (kuruş) for a delivery/eve-servis order. 0 disables the floor. */
  readonly homeMinOrderMinor: number;
  /** Flat fee (kuruş) on a delivery/eve-servis order. 0 = free delivery. */
  readonly homeDeliveryFeeMinor: number;
  /** Flat fee (kuruş) on a cargo order. 0 = free shipping for every cargo order. */
  readonly cargoFeeMinor: number;
  /** Cargo subtotal (kuruş) at or above which shipping is free. 0 = no threshold. */
  readonly cargoFreeShippingThresholdMinor: number;
  /** Home page heading (h1). Never blank. */
  readonly heroTitle: string;
  /** Sentence under the home page heading. Never blank. */
  readonly heroSubtitle: string;
}

/** 1.000 ₺ — the out-of-city order floor the owner set (2026-08-13). */
export const DEFAULT_CARGO_MIN_ORDER_MINOR = 100_000;
/** 250 ₺ — the eve-servis order floor the owner set (2026-08-13). */
export const DEFAULT_HOME_MIN_ORDER_MINOR = 25_000;

/** 50 ₺ — the eve-servis delivery fee the owner set (2026-09). */
export const DEFAULT_HOME_DELIVERY_FEE_MINOR = 5_000;

/** 150 ₺ — the cargo fee the owner set (2026-10-22). */
export const DEFAULT_CARGO_FEE_MINOR = 15_000;
/** 1.000 ₺ — cargo is free from this subtotal up (owner, 2026-10-22). */
export const DEFAULT_CARGO_FREE_SHIPPING_THRESHOLD_MINOR = 100_000;

/** The home page text as it was hard-coded before it became editable. */
export const DEFAULT_HERO_TITLE = "Çiftlikten sofranıza";
export const DEFAULT_HERO_SUBTITLE =
  "Akçadağ'daki çiftliğimizden köy yumurtası, kayısı ve dut. Seçin, sepete ekleyin, biz getirelim.";

export const DEFAULT_STOREFRONT_SETTINGS: StorefrontSettings = {
  homeDeliveryDays: DEFAULT_HOME_DELIVERY_DAYS,
  cargoMinOrderMinor: DEFAULT_CARGO_MIN_ORDER_MINOR,
  homeMinOrderMinor: DEFAULT_HOME_MIN_ORDER_MINOR,
  homeDeliveryFeeMinor: DEFAULT_HOME_DELIVERY_FEE_MINOR,
  cargoFeeMinor: DEFAULT_CARGO_FEE_MINOR,
  cargoFreeShippingThresholdMinor: DEFAULT_CARGO_FREE_SHIPPING_THRESHOLD_MINOR,
  heroTitle: DEFAULT_HERO_TITLE,
  heroSubtitle: DEFAULT_HERO_SUBTITLE,
};

/** Guard rail on the admin form: 100.000 ₺ is far past any real basket. */
const MAX_CARGO_MIN_ORDER_MINOR = 10_000_000;
const MAX_HOME_MIN_ORDER_MINOR = 10_000_000;
/** 10.000 ₺ — far past any real delivery fee; catches a stray extra zero. */
const MAX_HOME_DELIVERY_FEE_MINOR = 1_000_000;
const MAX_CARGO_FEE_MINOR = 1_000_000;
const MAX_CARGO_FREE_SHIPPING_THRESHOLD_MINOR = 10_000_000;

/**
 * A required kuruş amount. Missing/blank is refused, not coerced:
 * `Number(null)` and `Number("")` are 0, so a form field that never arrived
 * would silently make a fee free (or a threshold vanish).
 */
function requiredMinor(label: string, max: number) {
  return z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    z.coerce
      .number({ message: `${label} gerekli.` })
      .int(`${label} kuruş cinsinden tam sayı olmalı.`)
      .min(0, `${label} negatif olamaz.`)
      .max(max, `${label} çok yüksek.`),
  );
}

/** Same limits as the CHECK constraints in migration 20261026200332. */
export const MAX_HERO_TITLE_LENGTH = 80;
export const MAX_HERO_SUBTITLE_LENGTH = 240;

/**
 * Required one-line text, trimmed. Missing is refused rather than defaulted:
 * a form field that never arrived must not blank the home page heading.
 */
function requiredText(label: string, max: number) {
  return z
    .string({ message: `${label} gerekli.` })
    .trim()
    .min(1, `${label} boş olamaz.`)
    .max(max, `${label} en fazla ${max} karakter olabilir.`);
}

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
  home_min_order_minor: z.coerce
    .number()
    .int("Alt limit kuruş cinsinden tam sayı olmalı.")
    .min(0, "Alt limit negatif olamaz.")
    .max(MAX_HOME_MIN_ORDER_MINOR, "Alt limit çok yüksek."),
  home_delivery_fee_minor: requiredMinor("Teslimat ücreti", MAX_HOME_DELIVERY_FEE_MINOR),
  cargo_fee_minor: requiredMinor("Kargo ücreti", MAX_CARGO_FEE_MINOR),
  cargo_free_shipping_threshold_minor: requiredMinor(
    "Ücretsiz kargo limiti",
    MAX_CARGO_FREE_SHIPPING_THRESHOLD_MINOR,
  ),
  hero_title: requiredText("Ana sayfa başlığı", MAX_HERO_TITLE_LENGTH),
  hero_subtitle: requiredText("Ana sayfa açıklaması", MAX_HERO_SUBTITLE_LENGTH),
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
    homeMinOrderMinor: parsed.home_min_order_minor,
    homeDeliveryFeeMinor: parsed.home_delivery_fee_minor,
    cargoFeeMinor: parsed.cargo_fee_minor,
    cargoFreeShippingThresholdMinor: parsed.cargo_free_shipping_threshold_minor,
    heroTitle: parsed.hero_title,
    heroSubtitle: parsed.hero_subtitle,
  };
}
