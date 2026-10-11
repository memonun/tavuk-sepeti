/**
 * "Every N days / weeks / months / years" — the repeat rule shared by Takvim
 * events and Anımsatıcılar. Pure calendar math over YYYY-MM-DD Istanbul days
 * (no DST, so UTC-day arithmetic is exact — see shared/utils/date.ts).
 *
 * A series is its anchor day plus k steps (k ≥ 0). Month and year steps are
 * counted from the anchor in ONE jump (`anchor + k·n months`, not one month at
 * a time), and a 31st clamps to a short month's last day without dragging the
 * rest of the series down with it: 31 Oca → 28 Şub → 31 Mar.
 */
import { addDaysToYmd, addMonthsToYmd, ymdDayDiff } from "@/shared/utils/date";

export const REPEAT_UNITS = ["day", "week", "month", "year"] as const;
export type RepeatUnit = (typeof REPEAT_UNITS)[number];

export interface RepeatRule {
  readonly unit: RepeatUnit;
  /** 1 = every unit; 3 + "month" = every three months. */
  readonly every: number;
}

export function isRepeatUnit(value: unknown): value is RepeatUnit {
  return typeof value === "string" && (REPEAT_UNITS as readonly string[]).includes(value);
}

/** Months per step for the month-based units; null for the day-based ones. */
function stepMonths(rule: RepeatRule): number | null {
  if (rule.unit === "month") return rule.every;
  if (rule.unit === "year") return rule.every * 12;
  return null;
}

function stepDays(rule: RepeatRule): number {
  return rule.unit === "week" ? rule.every * 7 : rule.every;
}

/** The k-th occurrence of the series (k = 0 is the anchor itself). */
export function occurrenceYmd(anchor: string, rule: RepeatRule, k: number): string {
  const months = stepMonths(rule);
  return months === null
    ? addDaysToYmd(anchor, k * stepDays(rule))
    : addMonthsToYmd(anchor, k * months);
}

/** The smallest k ≥ 0 whose occurrence falls on or after `ymd`. */
export function firstOccurrenceIndexOnOrAfter(
  anchor: string,
  rule: RepeatRule,
  ymd: string,
): number {
  const months = stepMonths(rule);
  if (months === null) {
    const elapsed = ymdDayDiff(anchor, ymd);
    return elapsed <= 0 ? 0 : Math.ceil(elapsed / stepDays(rule));
  }
  const [anchorYear, anchorMonth] = anchor.split("-").map(Number) as [number, number];
  const [year, month] = ymd.split("-").map(Number) as [number, number];
  const monthsElapsed = year * 12 + month - (anchorYear * 12 + anchorMonth);
  // Every occurrence before index floor(elapsed / step) lands in an earlier
  // month than `ymd`, so the answer is at most a step or two past it.
  let k = Math.max(0, Math.floor(monthsElapsed / months));
  while (occurrenceYmd(anchor, rule, k) < ymd) k += 1;
  return k;
}

/**
 * The first occurrence AFTER the anchor that also falls strictly after `today`.
 * Used when a repeating reminder is ticked off: finishing on time or early
 * gives the next slot; finishing late skips the missed slots instead of
 * back-filling already-overdue ones, and the weekday / day-of-month stays put.
 */
export function nextOccurrenceAfter(anchor: string, rule: RepeatRule, today: string): string {
  const k = Math.max(1, firstOccurrenceIndexOnOrAfter(anchor, rule, addDaysToYmd(today, 1)));
  return occurrenceYmd(anchor, rule, k);
}

const EVERY_ONE: Readonly<Record<RepeatUnit, string>> = {
  day: "Her gün",
  week: "Her hafta",
  month: "Her ay",
  year: "Her yıl",
};

/** Turkish locative for "every N <unit>" — "3 günde bir", "2 yılda bir". */
const EVERY_N: Readonly<Record<RepeatUnit, string>> = {
  day: "günde",
  week: "haftada",
  month: "ayda",
  year: "yılda",
};

/** "Her hafta", "3 ayda bir", … — the label shown next to a repeating item. */
export function describeRepeatRule(rule: RepeatRule): string {
  if (rule.every === 1) return EVERY_ONE[rule.unit];
  return `${rule.every} ${EVERY_N[rule.unit]} bir`;
}
