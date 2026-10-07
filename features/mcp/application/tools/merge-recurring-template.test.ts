import { describe, expect, it } from "vitest";

import { mergeRecurringTemplate } from "@/features/mcp/application/tools/merge-recurring-template";

type Current = Parameters<typeof mergeRecurringTemplate>[0];

const monthly = {
  id: "t1",
  name: "Kira",
  category_id: "c1",
  vendor: "Ev sahibi",
  description: "Depo",
  amount_type: "fixed",
  default_amount_minor: 1500000,
  cadence: "monthly",
  day_of_week: null,
  day_of_month: 5,
  start_date: "2026-01-05",
  end_date: null,
  payment_method: "cash",
  note: null,
} as unknown as Current;

const weekly = { ...monthly, cadence: "weekly", day_of_week: 2, day_of_month: null } as unknown as Current;

describe("mergeRecurringTemplate", () => {
  it("keeps every stored field the caller did not mention", () => {
    expect(mergeRecurringTemplate(monthly, "t1", { default_amount_minor: 1650000 })).toEqual({
      id: "t1",
      name: "Kira",
      category_id: "c1",
      vendor: "Ev sahibi",
      description: "Depo",
      amount_type: "fixed",
      default_amount_minor: 1650000,
      cadence: "monthly",
      day_of_week: null,
      day_of_month: 5,
      start_date: "2026-01-05",
      end_date: null,
      payment_method: "cash",
      note: null,
    });
  });

  it("clears a field only when null is sent explicitly", () => {
    const merged = mergeRecurringTemplate(monthly, "t1", { vendor: null, end_date: "2026-12-31" });
    expect(merged.vendor).toBeNull();
    expect(merged.end_date).toBe("2026-12-31");
    expect(merged.description).toBe("Depo");
  });

  it("weekly → monthly drops the inherited weekday and uses the supplied day of month", () => {
    const merged = mergeRecurringTemplate(weekly, "t1", { cadence: "monthly", day_of_month: 10 });
    expect(merged).toMatchObject({ cadence: "monthly", day_of_week: null, day_of_month: 10 });
  });

  it("monthly → weekly drops the inherited day of month", () => {
    const merged = mergeRecurringTemplate(monthly, "t1", { cadence: "weekly", day_of_week: 1 });
    expect(merged).toMatchObject({ cadence: "weekly", day_of_week: 1, day_of_month: null });
  });

  it("changing cadence without the new day leaves it null so the panel's own validation asks for it", () => {
    const merged = mergeRecurringTemplate(monthly, "t1", { cadence: "weekly" });
    expect(merged.day_of_week).toBeNull();
    expect(merged.day_of_month).toBeNull();
  });

  it("never rewrites a day the caller sent explicitly (an inconsistent request still fails validation)", () => {
    const merged = mergeRecurringTemplate(monthly, "t1", { cadence: "weekly", day_of_week: 1, day_of_month: 5 });
    expect(merged.day_of_month).toBe(5);
  });

  it("keeps the inherited day when the cadence is unchanged", () => {
    expect(mergeRecurringTemplate(weekly, "t1", { name: "Haftalık" })).toMatchObject({
      day_of_week: 2,
      day_of_month: null,
    });
  });
});
