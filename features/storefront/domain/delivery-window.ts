/**
 * Which calendar days the van actually goes out — "eve servis günleri".
 *
 * The storefront used to offer every day in the scheduling horizon, so a
 * customer could pick a Tuesday for a route that only runs on Wednesday and
 * Saturday. The days are DATA, not a rule baked into the checkout: they arrive
 * from `storefront_settings` (owner-editable in the admin), and this module is
 * the pure math the UI and the Server Action both run so a hand-crafted submit
 * cannot land on a day the van does not drive.
 *
 * Pure and timezone-agnostic: the caller resolves "today" to Europe/Istanbul
 * (CLAUDE.md §7) and passes ISO date-only strings in. Weekday math is done in
 * UTC because a date-only value has no DST to drift over.
 */

/** 0=Sunday … 6=Saturday — the same base `recurring_templates.day_of_week` uses. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_NAMES_TR: Readonly<Record<Weekday, string>> = {
  0: "Pazar",
  1: "Pazartesi",
  2: "Salı",
  3: "Çarşamba",
  4: "Perşembe",
  5: "Cuma",
  6: "Cumartesi",
};

/** Every weekday, in display order (Monday first — TR convention). */
export const WEEKDAYS_TR_ORDER: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/**
 * Launch default: Çarşamba + Cumartesi (owner, 2026-08-13). Only a DEFAULT —
 * the live value lives in `storefront_settings.home_delivery_days` so the owner
 * can change the delivery days without a deploy.
 */
export const DEFAULT_HOME_DELIVERY_DAYS: readonly Weekday[] = [3, 6];

const MONTH_NAMES_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

/** Narrowing guard for values coming from the DB / a form. */
export function isWeekday(value: number): value is Weekday {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

/** Weekday of a YYYY-MM-DD calendar date. */
export function weekdayOfIso(dateIso: string): Weekday {
  const [y, m, d] = dateIso.split("-").map(Number);
  const day = new Date(
    Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1),
  ).getUTCDay();
  // getUTCDay() is 0-6 by definition; the guard keeps the type honest.
  return isWeekday(day) ? day : 0;
}

/** True when the van drives on `dateIso`. An empty day list means "never". */
export function isHomeDeliveryDay(
  dateIso: string,
  days: readonly Weekday[],
): boolean {
  return days.includes(weekdayOfIso(dateIso));
}

/**
 * Every delivery date in [earliestIso, latestIso] inclusive.
 *
 * This is what the checkout renders instead of a free date input: the customer
 * picks from days we actually drive, so "teslimat günü" can never be a day the
 * route does not run. Bounded by the horizon the caller passes (21 days at the
 * time of writing), so the loop is small by construction.
 */
export function listHomeDeliveryDates(
  earliestIso: string,
  latestIso: string,
  days: readonly Weekday[],
): string[] {
  if (days.length === 0 || earliestIso > latestIso) return [];

  const dates: string[] = [];
  const [y, m, d] = earliestIso.split("-").map(Number);
  const cursor = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));

  for (let iso = cursor.toISOString().slice(0, 10); iso <= latestIso; ) {
    if (isHomeDeliveryDay(iso, days)) dates.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    iso = cursor.toISOString().slice(0, 10);
  }

  return dates;
}

/** Sorted, de-duplicated day list in TR display order (Monday first). */
export function sortWeekdays(days: readonly Weekday[]): Weekday[] {
  return WEEKDAYS_TR_ORDER.filter((day) => days.includes(day));
}

/** `[3, 6]` → `"Çarşamba ve Cumartesi"` — customer-facing, so it reads as prose. */
export function formatHomeDeliveryDays(days: readonly Weekday[]): string {
  const names = sortWeekdays(days).map((day) => WEEKDAY_NAMES_TR[day]);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ve ${names[names.length - 1]}`;
}

/** `"2026-08-19"` → `"19 Ağustos Çarşamba"` — the date-picker option label. */
export function formatDeliveryDateLabel(dateIso: string): string {
  const [, m, d] = dateIso.split("-").map(Number);
  const month = MONTH_NAMES_TR[(m ?? 1) - 1] ?? "";
  return `${d ?? 1} ${month} ${WEEKDAY_NAMES_TR[weekdayOfIso(dateIso)]}`;
}
