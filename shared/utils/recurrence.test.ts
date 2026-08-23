import { describe, expect, it } from "vitest";

import { computeNextRunAt, firstRunOnOrAfter } from "@/shared/utils/recurrence";
import { formatHHmm, toIstanbulDateString } from "@/shared/utils/date";

// 2026-06-22 is a Monday.
const MON = "2026-06-22";
const at = (ymd: string) => new Date(`${ymd}T06:00:00+03:00`);
const ymd = (d: Date) => toIstanbulDateString(d);

describe("firstRunOnOrAfter", () => {
  it("weekly: same weekday as start → start day itself", () => {
    expect(ymd(firstRunOnOrAfter(MON, "weekly", { dayOfWeek: 1 }))).toBe("2026-06-22");
  });
  it("weekly: earlier weekday wraps to next week", () => {
    expect(ymd(firstRunOnOrAfter(MON, "weekly", { dayOfWeek: 0 }))).toBe("2026-06-28");
  });
  it("monthly (intervalMonths default 1): day already passed → next month", () => {
    expect(ymd(firstRunOnOrAfter(MON, "monthly", { dayOfMonth: 15 }))).toBe("2026-07-15");
  });
  it("monthly: clamps day 31 to non-leap Feb", () => {
    expect(ymd(firstRunOnOrAfter("2026-02-01", "monthly", { dayOfMonth: 31 }))).toBe("2026-02-28");
  });
  it("quarterly (intervalMonths: 3): day already passed this month → 3 months later", () => {
    expect(
      ymd(firstRunOnOrAfter(MON, "monthly", { dayOfMonth: 15, intervalMonths: 3 })),
    ).toBe("2026-09-15");
  });
});

describe("computeNextRunAt (advance)", () => {
  it("weekly (intervalWeeks default 1): from the weekday → +7", () => {
    expect(ymd(computeNextRunAt("weekly", { dayOfWeek: 1 }, at(MON)))).toBe("2026-06-29");
  });
  it("biweekly (intervalWeeks: 2): from the weekday → +14", () => {
    expect(
      ymd(computeNextRunAt("weekly", { dayOfWeek: 1, intervalWeeks: 2 }, at(MON))),
    ).toBe("2026-07-06");
  });
  it("weekly: self-corrects onto day_of_week when `from` is off-day", () => {
    expect(ymd(computeNextRunAt("weekly", { dayOfWeek: 3 }, at(MON)))).toBe("2026-06-24");
  });
  it("monthly: advances to next month's day_of_month", () => {
    expect(
      ymd(computeNextRunAt("monthly", { dayOfMonth: 15 }, at("2026-06-15"))),
    ).toBe("2026-07-15");
  });
  it("monthly: uses day_of_month intent (clamped), not the prior clamped day", () => {
    expect(
      ymd(computeNextRunAt("monthly", { dayOfMonth: 31 }, at("2026-01-31"))),
    ).toBe("2026-02-28");
  });
  it("quarterly (intervalMonths: 3): from Nov 30 → Feb 28 (non-leap)", () => {
    expect(
      ymd(computeNextRunAt("monthly", { dayOfMonth: 30, intervalMonths: 3 }, at("2025-11-30"))),
    ).toBe("2026-02-28");
  });
  it("quarterly: from Nov 30 in a year rolling into a leap Feb → Feb 29", () => {
    expect(
      ymd(computeNextRunAt("monthly", { dayOfMonth: 31, intervalMonths: 3 }, at("2023-11-30"))),
    ).toBe("2024-02-29");
  });
  it("6-monthly (intervalMonths: 6): rolls the year over", () => {
    expect(
      ymd(computeNextRunAt("monthly", { dayOfMonth: 15, intervalMonths: 6 }, at("2026-08-15"))),
    ).toBe("2027-02-15");
  });
  it("yearly (intervalMonths: 12): Feb 29 leap-day template → next Feb 28 (non-leap)", () => {
    expect(
      ymd(computeNextRunAt("monthly", { dayOfMonth: 29, intervalMonths: 12 }, at("2024-02-29"))),
    ).toBe("2025-02-28");
  });
  it("yearly: same calendar day the following year in a common case", () => {
    expect(
      ymd(computeNextRunAt("monthly", { dayOfMonth: 12, intervalMonths: 12 }, at("2026-09-12"))),
    ).toBe("2027-09-12");
  });
  it("always lands at the 06:00 Istanbul generation hour", () => {
    expect(formatHHmm(computeNextRunAt("weekly", { dayOfWeek: 1 }, at(MON)))).toBe("06:00");
    expect(formatHHmm(firstRunOnOrAfter(MON, "monthly", { dayOfMonth: 25 }))).toBe("06:00");
  });
  it("result is strictly after `from`", () => {
    const from = at(MON);
    expect(computeNextRunAt("weekly", { dayOfWeek: 1 }, from).getTime()).toBeGreaterThan(from.getTime());
    expect(
      computeNextRunAt("monthly", { dayOfMonth: 15, intervalMonths: 3 }, from).getTime(),
    ).toBeGreaterThan(from.getTime());
  });
});
