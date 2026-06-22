import { describe, expect, it } from "vitest";

import { recurringTemplateFormSchema } from "@/features/recurring/domain/recurring-template.schema";

const base = {
  customer_id: "11111111-1111-1111-1111-111111111111",
  items: [{ product_key: "eggs", quantity: 3 }],
  payment_method: "cash_on_delivery" as const,
  active: true,
};
const weekly = { ...base, cadence: "weekly" as const, day_of_week: 1, day_of_month: null };
const monthly = { ...base, cadence: "monthly" as const, day_of_week: null, day_of_month: 15 };

const ok = (v: unknown) => recurringTemplateFormSchema.safeParse(v).success;

describe("recurringTemplateFormSchema", () => {
  it("accepts a valid weekly template", () => {
    expect(ok(weekly)).toBe(true);
    expect(ok({ ...weekly, cadence: "biweekly" })).toBe(true);
  });

  it("accepts a valid monthly template", () => {
    expect(ok(monthly)).toBe(true);
  });

  it("rejects weekly/biweekly without day_of_week", () => {
    expect(ok({ ...weekly, day_of_week: null })).toBe(false);
    expect(ok({ ...weekly, cadence: "biweekly", day_of_week: null })).toBe(false);
  });

  it("rejects weekly with a day_of_month set", () => {
    expect(ok({ ...weekly, day_of_month: 15 })).toBe(false);
  });

  it("rejects monthly without day_of_month", () => {
    expect(ok({ ...monthly, day_of_month: null })).toBe(false);
  });

  it("rejects monthly with a day_of_week set", () => {
    expect(ok({ ...monthly, day_of_week: 1 })).toBe(false);
  });

  it("rejects an empty items list", () => {
    expect(ok({ ...weekly, items: [] })).toBe(false);
  });

  it("enforces day_of_week bounds (0..6)", () => {
    expect(ok({ ...weekly, day_of_week: 0 })).toBe(true);
    expect(ok({ ...weekly, day_of_week: 6 })).toBe(true);
    expect(ok({ ...weekly, day_of_week: 7 })).toBe(false);
  });

  it("enforces day_of_month bounds (1..31)", () => {
    expect(ok({ ...monthly, day_of_month: 1 })).toBe(true);
    expect(ok({ ...monthly, day_of_month: 31 })).toBe(true);
    expect(ok({ ...monthly, day_of_month: 0 })).toBe(false);
    expect(ok({ ...monthly, day_of_month: 32 })).toBe(false);
  });

  it("rejects an unknown payment_method", () => {
    expect(ok({ ...weekly, payment_method: "crypto" })).toBe(false);
  });

  it("rejects a non-uuid customer_id and a non-positive quantity", () => {
    expect(ok({ ...weekly, customer_id: "nope" })).toBe(false);
    expect(ok({ ...weekly, items: [{ product_key: "eggs", quantity: 0 }] })).toBe(false);
  });
});
