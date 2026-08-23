import { describe, expect, it } from "vitest";

import { createRecurringExpenseTemplateSchema } from "@/features/finance/domain/recurring-expense-template.schema";

const CATEGORY_ID = "9773e0ab-2ad3-4ed3-bc58-4990f6e37d52";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Türk Telekom İnternet",
    category_id: CATEGORY_ID,
    vendor: null,
    description: null,
    amount_type: "variable",
    default_amount_minor: 85000,
    cadence: "monthly",
    day_of_week: null,
    day_of_month: 12,
    start_date: "2026-09-01",
    end_date: null,
    payment_method: null,
    note: null,
    ...overrides,
  };
}

describe("createRecurringExpenseTemplateSchema — cadence shape", () => {
  it("accepts monthly with day_of_month set", () => {
    expect(createRecurringExpenseTemplateSchema.safeParse(baseInput()).success).toBe(true);
  });

  it("accepts weekly with day_of_week set", () => {
    const result = createRecurringExpenseTemplateSchema.safeParse(
      baseInput({ cadence: "weekly", day_of_week: 3, day_of_month: null }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects weekly with no day_of_week", () => {
    const result = createRecurringExpenseTemplateSchema.safeParse(
      baseInput({ cadence: "weekly", day_of_week: null, day_of_month: null }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects weekly with day_of_month also set", () => {
    const result = createRecurringExpenseTemplateSchema.safeParse(
      baseInput({ cadence: "weekly", day_of_week: 3, day_of_month: 12 }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects monthly with no day_of_month", () => {
    const result = createRecurringExpenseTemplateSchema.safeParse(
      baseInput({ day_of_month: null }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects monthly with day_of_week also set", () => {
    const result = createRecurringExpenseTemplateSchema.safeParse(
      baseInput({ day_of_week: 1 }),
    );
    expect(result.success).toBe(false);
  });

  it.each(["quarterly", "semiannual", "yearly"] as const)(
    "accepts %s cadence with day_of_month set",
    (cadence) => {
      const result = createRecurringExpenseTemplateSchema.safeParse(baseInput({ cadence }));
      expect(result.success).toBe(true);
    },
  );
});

describe("createRecurringExpenseTemplateSchema — amount", () => {
  it("accepts a fixed amount", () => {
    const result = createRecurringExpenseTemplateSchema.safeParse(
      baseInput({ amount_type: "fixed", default_amount_minor: 45000 }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects zero/negative amount for either type", () => {
    expect(createRecurringExpenseTemplateSchema.safeParse(baseInput({ default_amount_minor: 0 })).success).toBe(false);
    expect(
      createRecurringExpenseTemplateSchema.safeParse(
        baseInput({ amount_type: "fixed", default_amount_minor: -100 }),
      ).success,
    ).toBe(false);
  });
});

describe("createRecurringExpenseTemplateSchema — date range", () => {
  it("accepts no end_date", () => {
    expect(createRecurringExpenseTemplateSchema.safeParse(baseInput()).success).toBe(true);
  });

  it("accepts end_date on/after start_date", () => {
    const result = createRecurringExpenseTemplateSchema.safeParse(
      baseInput({ start_date: "2026-09-01", end_date: "2027-09-01" }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects end_date before start_date", () => {
    const result = createRecurringExpenseTemplateSchema.safeParse(
      baseInput({ start_date: "2026-09-01", end_date: "2026-08-01" }),
    );
    expect(result.success).toBe(false);
  });
});
