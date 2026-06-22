import { describe, expect, it } from "vitest";

import {
  computeNextRunAt,
  firstRunOnOrAfter,
} from "@/features/recurring/domain/compute-next-run";
import { formatHHmm, toIstanbulDateString } from "@/shared/utils/date";

// 2026-06-22 is a Monday (the app shows "Pazartesi, 22 Haz 2026").
// dow base: Sunday=0 … Monday=1, Wednesday=3, Saturday=6.
const MON = "2026-06-22";
/** A prior run instant on `ymd` at the generation hour (06:00 Istanbul). */
const at = (ymd: string) => new Date(`${ymd}T06:00:00+03:00`);
const ymd = (d: Date) => toIstanbulDateString(d);

describe("firstRunOnOrAfter", () => {
  it("weekly: same weekday as start → start day itself (delta 0)", () => {
    expect(ymd(firstRunOnOrAfter(MON, "weekly", { dayOfWeek: 1 }))).toBe("2026-06-22");
  });
  it("weekly: later weekday this week", () => {
    // Wed (3) is 2 days after Mon.
    expect(ymd(firstRunOnOrAfter(MON, "weekly", { dayOfWeek: 3 }))).toBe("2026-06-24");
  });
  it("weekly: earlier weekday wraps to next week", () => {
    // Sunday (0) from a Monday → +6.
    expect(ymd(firstRunOnOrAfter(MON, "weekly", { dayOfWeek: 0 }))).toBe("2026-06-28");
  });
  it("monthly: day already passed this month → next month", () => {
    expect(ymd(firstRunOnOrAfter(MON, "monthly", { dayOfMonth: 15 }))).toBe("2026-07-15");
  });
  it("monthly: day still ahead this month → this month", () => {
    expect(ymd(firstRunOnOrAfter(MON, "monthly", { dayOfMonth: 25 }))).toBe("2026-06-25");
  });
  it("monthly: clamps day 31 to a short month (leap Feb)", () => {
    expect(ymd(firstRunOnOrAfter("2024-02-01", "monthly", { dayOfMonth: 31 }))).toBe("2024-02-29");
  });
  it("monthly: clamps day 31 to non-leap Feb", () => {
    expect(ymd(firstRunOnOrAfter("2026-02-01", "monthly", { dayOfMonth: 31 }))).toBe("2026-02-28");
  });
});

describe("computeNextRunAt (advance)", () => {
  it("weekly: from the weekday → +7", () => {
    expect(ymd(computeNextRunAt("weekly", { dayOfWeek: 1 }, at(MON)))).toBe("2026-06-29");
  });
  it("biweekly: from the weekday → +14", () => {
    expect(ymd(computeNextRunAt("biweekly", { dayOfWeek: 1 }, at(MON)))).toBe("2026-07-06");
  });
  it("weekly: self-corrects onto day_of_week when `from` is off-day", () => {
    // from a Monday but target Wednesday → next Wednesday (+2), not +7.
    expect(ymd(computeNextRunAt("weekly", { dayOfWeek: 3 }, at(MON)))).toBe("2026-06-24");
  });
  it("monthly: advances to next month's day_of_month", () => {
    expect(ymd(computeNextRunAt("monthly", { dayOfMonth: 15 }, at("2026-06-15")))).toBe("2026-07-15");
  });
  it("monthly: uses day_of_month intent (clamped), not the prior clamped day", () => {
    // Prior run was Jan 31; next month is Feb → clamp to 28 (2026 non-leap).
    expect(ymd(computeNextRunAt("monthly", { dayOfMonth: 31 }, at("2026-01-31")))).toBe("2026-02-28");
  });
  it("monthly: rolls the year over (Dec → Jan)", () => {
    expect(ymd(computeNextRunAt("monthly", { dayOfMonth: 15 }, at("2026-12-15")))).toBe("2027-01-15");
  });
  it("always lands at the 06:00 Istanbul generation hour", () => {
    expect(formatHHmm(computeNextRunAt("weekly", { dayOfWeek: 1 }, at(MON)))).toBe("06:00");
    expect(formatHHmm(firstRunOnOrAfter(MON, "monthly", { dayOfMonth: 25 }))).toBe("06:00");
  });
  it("result is strictly after `from`", () => {
    const from = at(MON);
    expect(computeNextRunAt("weekly", { dayOfWeek: 1 }, from).getTime()).toBeGreaterThan(from.getTime());
    expect(computeNextRunAt("biweekly", { dayOfWeek: 1 }, from).getTime()).toBeGreaterThan(from.getTime());
  });
});
