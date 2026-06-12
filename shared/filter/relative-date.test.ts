/**
 * Relative-date resolver: verify the half-open [gte, lt) bounds are internally
 * consistent and anchored to today (Europe/Istanbul). Anchored to the real
 * clock (no Date mocking available here), so assertions are relational.
 */
import { describe, expect, it } from "vitest";

import { addDaysToYmd, todayInIstanbul } from "@/shared/utils/date";
import { resolveRelativeDateBounds } from "@/shared/filter/relative-date";

describe("resolveRelativeDateBounds", () => {
  const today = todayInIstanbul();

  it("is_today is exactly one day wide", () => {
    expect(resolveRelativeDateBounds("is_today")).toEqual({
      gte: today,
      lt: addDaysToYmd(today, 1),
    });
  });

  it("is_past is everything strictly before today", () => {
    expect(resolveRelativeDateBounds("is_past")).toEqual({ lt: today });
  });

  it("is_future starts tomorrow", () => {
    expect(resolveRelativeDateBounds("is_future")).toEqual({
      gte: addDaysToYmd(today, 1),
    });
  });

  it("is_this_week is a 7-day Monday-anchored window containing today", () => {
    const { gte, lt } = resolveRelativeDateBounds("is_this_week");
    expect(gte).toBeDefined();
    expect(lt).toBeDefined();
    // today falls within [gte, lt)
    expect(gte! <= today).toBe(true);
    expect(today < lt!).toBe(true);
    // exactly 7 days wide, Monday start
    expect(addDaysToYmd(gte!, 7)).toBe(lt);
    expect(new Date(`${gte!}T00:00:00Z`).getUTCDay()).toBe(1); // Monday
  });

  it("is_this_month spans the 1st to the 1st of next month, containing today", () => {
    const { gte, lt } = resolveRelativeDateBounds("is_this_month");
    expect(gte).toBe(`${today.slice(0, 7)}-01`);
    expect(gte! <= today).toBe(true);
    expect(today < lt!).toBe(true);
    expect(lt!.endsWith("-01")).toBe(true);
  });

  it("returns empty bounds for a non-relative operator", () => {
    expect(resolveRelativeDateBounds("contains")).toEqual({});
  });
});
