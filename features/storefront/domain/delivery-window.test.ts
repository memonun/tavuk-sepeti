import { describe, expect, it } from "vitest";

import {
  DEFAULT_HOME_DELIVERY_DAYS,
  formatDeliveryDateLabel,
  formatHomeDeliveryDays,
  isHomeDeliveryDay,
  isWeekday,
  listHomeDeliveryDates,
  sortWeekdays,
  weekdayOfIso,
  type Weekday,
} from "@/features/storefront/domain/delivery-window";

// 2026-08-12 is a Wednesday; the anchors below hang off it.
describe("weekdayOfIso", () => {
  it("maps an ISO date to 0=Sunday..6=Saturday", () => {
    expect(weekdayOfIso("2026-08-12")).toBe(3); // Çarşamba
    expect(weekdayOfIso("2026-08-15")).toBe(6); // Cumartesi
    expect(weekdayOfIso("2026-08-16")).toBe(0); // Pazar
  });

  // Date-only values must not drift when the process runs in another timezone —
  // the UTC math is what guarantees it.
  it("is stable across month and year boundaries", () => {
    expect(weekdayOfIso("2026-01-01")).toBe(4); // Perşembe
    expect(weekdayOfIso("2025-12-31")).toBe(3);
  });
});

describe("isHomeDeliveryDay", () => {
  it("accepts only the configured days", () => {
    expect(isHomeDeliveryDay("2026-08-12", DEFAULT_HOME_DELIVERY_DAYS)).toBe(true);
    expect(isHomeDeliveryDay("2026-08-15", DEFAULT_HOME_DELIVERY_DAYS)).toBe(true);
    expect(isHomeDeliveryDay("2026-08-13", DEFAULT_HOME_DELIVERY_DAYS)).toBe(false);
  });

  // A misconfigured empty list must close the calendar, never open it: the
  // checkout then shows "no delivery day available" instead of booking a van
  // that does not drive.
  it("treats an empty day list as no delivery at all", () => {
    expect(isHomeDeliveryDay("2026-08-12", [])).toBe(false);
  });

  it("follows the owner's day change", () => {
    const mondayOnly: readonly Weekday[] = [1];
    expect(isHomeDeliveryDay("2026-08-17", mondayOnly)).toBe(true);
    expect(isHomeDeliveryDay("2026-08-12", mondayOnly)).toBe(false);
  });
});

describe("listHomeDeliveryDates", () => {
  it("returns every configured day inside the window, in order", () => {
    expect(
      listHomeDeliveryDates("2026-08-13", "2026-08-27", DEFAULT_HOME_DELIVERY_DAYS),
    ).toEqual([
      "2026-08-15",
      "2026-08-19",
      "2026-08-22",
      "2026-08-26",
    ]);
  });

  it("includes both bounds when they fall on a delivery day", () => {
    expect(
      listHomeDeliveryDates("2026-08-12", "2026-08-15", DEFAULT_HOME_DELIVERY_DAYS),
    ).toEqual(["2026-08-12", "2026-08-15"]);
  });

  it("returns nothing for an inverted window or an empty day list", () => {
    expect(
      listHomeDeliveryDates("2026-08-20", "2026-08-10", DEFAULT_HOME_DELIVERY_DAYS),
    ).toEqual([]);
    expect(listHomeDeliveryDates("2026-08-10", "2026-08-30", [])).toEqual([]);
  });

  it("crosses a month boundary without skipping a day", () => {
    expect(
      listHomeDeliveryDates("2026-08-29", "2026-09-03", DEFAULT_HOME_DELIVERY_DAYS),
    ).toEqual(["2026-08-29", "2026-09-02"]);
  });
});

describe("formatHomeDeliveryDays", () => {
  it("reads as prose for the customer", () => {
    expect(formatHomeDeliveryDays([3, 6])).toBe("Çarşamba ve Cumartesi");
    expect(formatHomeDeliveryDays([1])).toBe("Pazartesi");
    expect(formatHomeDeliveryDays([1, 3, 6])).toBe("Pazartesi, Çarşamba ve Cumartesi");
    expect(formatHomeDeliveryDays([])).toBe("");
  });

  it("orders Monday-first regardless of how the days were stored", () => {
    expect(formatHomeDeliveryDays([0, 3])).toBe("Çarşamba ve Pazar");
    expect(sortWeekdays([6, 1, 0])).toEqual([1, 6, 0]);
  });
});

describe("formatDeliveryDateLabel", () => {
  it("labels a date the way a Turkish customer reads it", () => {
    expect(formatDeliveryDateLabel("2026-08-19")).toBe("19 Ağustos Çarşamba");
    expect(formatDeliveryDateLabel("2026-01-03")).toBe("3 Ocak Cumartesi");
  });
});

describe("isWeekday", () => {
  it("rejects anything outside 0..6", () => {
    expect(isWeekday(0)).toBe(true);
    expect(isWeekday(6)).toBe(true);
    expect(isWeekday(7)).toBe(false);
    expect(isWeekday(-1)).toBe(false);
    expect(isWeekday(2.5)).toBe(false);
  });
});
