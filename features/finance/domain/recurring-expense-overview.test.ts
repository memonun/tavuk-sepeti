import { describe, expect, it } from "vitest";

import {
  buildRecurringExpenseOverview,
  urgencyFor,
  type PendingRecurringExpenseInput,
  type PlannedTemplateInput,
  type TemplateInfo,
} from "@/features/finance/domain/recurring-expense-overview";

const TODAY = "2026-09-21";
const TEMPLATES = new Map<string, TemplateInfo>([
  ["t-rent", { name: "Kira", categoryLabel: "Sabit / Kira", isEstimate: false }],
  ["t-power", { name: "Elektrik", categoryLabel: "Fatura / Elektrik", isEstimate: true }],
]);

const pending = (over: Partial<PendingRecurringExpenseInput>): PendingRecurringExpenseInput => ({
  expenseId: "e1",
  templateId: "t-rent",
  dueDate: "2026-09-30",
  amountMinor: 1_000_00,
  paymentMethod: null,
  vendor: null,
  ...over,
});

const planned = (over: Partial<PlannedTemplateInput>): PlannedTemplateInput => ({
  templateId: "t-rent",
  name: "Kira",
  categoryLabel: "Sabit / Kira",
  vendor: null,
  amountMinor: 1_000_00,
  isEstimate: false,
  paymentMethod: null,
  nextDueDate: "2026-10-05",
  endDate: null,
  ...over,
});

describe("urgencyFor", () => {
  it("classifies by days until due", () => {
    expect(urgencyFor(-1)).toBe("overdue");
    expect(urgencyFor(0)).toBe("today");
    expect(urgencyFor(7)).toBe("soon");
    expect(urgencyFor(8)).toBe("later");
  });
});

describe("buildRecurringExpenseOverview", () => {
  it("lists a bill due later this month as pending, with days left", () => {
    const o = buildRecurringExpenseOverview({
      today: TODAY,
      templates: TEMPLATES,
      pending: [pending({})],
      planned: [],
    });

    expect(o.items).toHaveLength(1);
    expect(o.items[0]).toMatchObject({
      kind: "pending",
      name: "Kira",
      daysUntil: 9,
      urgency: "later",
    });
    expect(o.restOfMonth).toEqual({ count: 1, totalMinor: 1_000_00 });
    expect(o.overdue.count).toBe(0);
  });

  it("separates overdue from the rest of the month", () => {
    const o = buildRecurringExpenseOverview({
      today: TODAY,
      templates: TEMPLATES,
      pending: [
        pending({ expenseId: "e1", dueDate: "2026-09-15", amountMinor: 500_00 }),
        pending({ expenseId: "e2", templateId: "t-power", dueDate: "2026-09-28", amountMinor: 300_00 }),
      ],
      planned: [],
    });

    expect(o.overdue).toEqual({ count: 1, totalMinor: 500_00 });
    expect(o.restOfMonth).toEqual({ count: 1, totalMinor: 300_00 });
    expect(o.pendingTotalMinor).toBe(800_00);
    expect(o.items[0]?.urgency).toBe("overdue");
    expect(o.items[1]?.isEstimate).toBe(true);
  });

  it("counts a bill due today as rest-of-month, not overdue", () => {
    const o = buildRecurringExpenseOverview({
      today: TODAY,
      templates: TEMPLATES,
      pending: [pending({ dueDate: TODAY })],
      planned: [],
    });
    expect(o.overdue.count).toBe(0);
    expect(o.restOfMonth.count).toBe(1);
    expect(o.items[0]?.urgency).toBe("today");
  });

  it("shows an ungenerated occurrence as planned, within the lookahead only", () => {
    const o = buildRecurringExpenseOverview({
      today: TODAY,
      templates: TEMPLATES,
      pending: [],
      planned: [
        planned({ templateId: "a", nextDueDate: "2026-10-05" }),
        planned({ templateId: "c", nextDueDate: "2026-12-01" }), // beyond the lookahead
      ],
    });

    expect(o.items.map((i) => i.templateId)).toEqual(["a"]);
    expect(o.items[0]?.kind).toBe("planned");
    // Planned rows are not money owed yet.
    expect(o.pendingTotalMinor).toBe(0);
    expect(o.restOfMonth.count).toBe(0);
  });

  it("drops a planned occurrence past the template's end date", () => {
    const o = buildRecurringExpenseOverview({
      today: TODAY,
      templates: TEMPLATES,
      pending: [],
      planned: [planned({ nextDueDate: "2026-10-05", endDate: "2026-09-30" })],
    });
    expect(o.items).toHaveLength(0);
  });

  it("sorts by due day", () => {
    const o = buildRecurringExpenseOverview({
      today: TODAY,
      templates: TEMPLATES,
      pending: [
        pending({ expenseId: "late", dueDate: "2026-09-30" }),
        pending({ expenseId: "early", dueDate: "2026-09-22" }),
      ],
      planned: [planned({})],
    });
    expect(o.items.map((i) => i.dueDate)).toEqual(["2026-09-22", "2026-09-30", "2026-10-05"]);
  });
});
