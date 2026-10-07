import { describe, expect, it } from "vitest";

import { mergeRecurringOrder } from "@/features/mcp/application/tools/merge-recurring-order";

type Current = Parameters<typeof mergeRecurringOrder>[0];

const weekly = {
  id: "t1",
  customer_id: "c1",
  cadence: "weekly",
  day_of_week: 2,
  day_of_month: null,
  items: [{ product_key: "dut", quantity: 1, extra: "dropped" }],
  payment_method: "cash_on_delivery",
  active: false,
} as unknown as Current;

const monthly = { ...weekly, cadence: "monthly", day_of_week: null, day_of_month: 10 } as unknown as Current;

describe("mergeRecurringOrder", () => {
  it("carries `active` over so a paused template is never silently re-activated", () => {
    expect(mergeRecurringOrder(weekly, { payment_method: "bank_transfer" }).active).toBe(false);
  });

  it("keeps everything not mentioned and strips unknown item fields", () => {
    expect(mergeRecurringOrder(weekly, {})).toEqual({
      customer_id: "c1",
      cadence: "weekly",
      day_of_week: 2,
      day_of_month: null,
      items: [{ product_key: "dut", quantity: 1 }],
      payment_method: "cash_on_delivery",
      active: false,
    });
  });

  it("replaces items wholesale when given", () => {
    expect(mergeRecurringOrder(weekly, { items: [{ product_key: "kayisi", quantity: 2 }] }).items).toEqual([
      { product_key: "kayisi", quantity: 2 },
    ]);
  });

  it("weekly → monthly drops the inherited weekday", () => {
    expect(mergeRecurringOrder(weekly, { cadence: "monthly", day_of_month: 5 })).toMatchObject({
      cadence: "monthly",
      day_of_week: null,
      day_of_month: 5,
    });
  });

  it("monthly → biweekly drops the inherited day of month", () => {
    expect(mergeRecurringOrder(monthly, { cadence: "biweekly", day_of_week: 4 })).toMatchObject({
      cadence: "biweekly",
      day_of_week: 4,
      day_of_month: null,
    });
  });

  it("weekly ↔ biweekly keeps the weekday", () => {
    expect(mergeRecurringOrder(weekly, { cadence: "biweekly" })).toMatchObject({ day_of_week: 2, day_of_month: null });
  });

  it("only forwards first_run_at when provided", () => {
    expect("first_run_at" in mergeRecurringOrder(weekly, {})).toBe(false);
    expect(mergeRecurringOrder(weekly, { first_run_at: "2026-11-01" })).toMatchObject({ first_run_at: "2026-11-01" });
  });
});
