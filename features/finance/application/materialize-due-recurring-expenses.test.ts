/**
 * The materialization driver decides WHEN a rutin gider becomes a real
 * (pending) expense. What matters: a bill due later this month is generated at
 * the start of the month, a next-month one is not, weekly templates generate
 * every occurrence in the month, and an end date stops generation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/shared/audit/log-audit", () => ({ logAudit: vi.fn() }));

const listDueTemplates = vi.fn();
const generateRecurringExpense = vi.fn();
const advanceNextRun = vi.fn();
vi.mock("@/features/finance/infrastructure/recurring-expense-template.repository", () => ({
  listDueTemplates: (...a: unknown[]) => listDueTemplates(...a),
  generateRecurringExpense: (...a: unknown[]) => generateRecurringExpense(...a),
  advanceNextRun: (...a: unknown[]) => advanceNextRun(...a),
}));

const { materializeDueRecurringExpenses } = await import(
  "@/features/finance/application/materialize-due-recurring-expenses"
);

function template(over: Record<string, unknown>) {
  return {
    id: "tpl-1",
    cadence: "monthly",
    day_of_week: null,
    day_of_month: 30,
    end_date: null,
    // 06:00 Istanbul on the 30th — what firstRunOnOrAfter produces.
    next_run_at: new Date("2026-09-30T06:00:00+03:00"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  generateRecurringExpense.mockResolvedValue({ ok: true, value: { expense_id: "exp-1" } });
  advanceNextRun.mockResolvedValue({ ok: true, value: undefined });
});

describe("materializeDueRecurringExpenses", () => {
  it("looks for templates due through the END of the month, not just today", async () => {
    listDueTemplates.mockResolvedValue({ ok: true, value: [] });

    await materializeDueRecurringExpenses("2026-09-01");

    const cutoff = listDueTemplates.mock.calls[0]?.[0] as Date;
    expect(cutoff.toISOString()).toBe(new Date("2026-09-30T23:59:59+03:00").toISOString());
  });

  it("generates a bill due on the 30th when the month has only just started", async () => {
    listDueTemplates.mockResolvedValue({ ok: true, value: [template({})] });

    const summary = await materializeDueRecurringExpenses("2026-09-01");

    expect(generateRecurringExpense).toHaveBeenCalledTimes(1);
    expect(generateRecurringExpense).toHaveBeenCalledWith("tpl-1", "2026-09-30", null);
    expect(summary.generated).toBe(1);
    // …and advances to next month's occurrence, which is beyond the cutoff.
    const next = advanceNextRun.mock.calls[0]?.[1] as Date;
    expect(next.toISOString().slice(0, 7)).toBe("2026-10");
  });

  it("generates every weekly occurrence left in the month in one pass", async () => {
    listDueTemplates.mockResolvedValue({
      ok: true,
      value: [
        template({
          cadence: "weekly",
          day_of_week: 1, // Monday
          day_of_month: null,
          next_run_at: new Date("2026-09-07T06:00:00+03:00"),
        }),
      ],
    });

    await materializeDueRecurringExpenses("2026-09-01");

    const dates = generateRecurringExpense.mock.calls.map((c) => c[1]);
    expect(dates).toEqual(["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
  });

  it("stops at the template's end date without advancing", async () => {
    listDueTemplates.mockResolvedValue({
      ok: true,
      value: [template({ end_date: "2026-09-15" })],
    });

    const summary = await materializeDueRecurringExpenses("2026-09-01");

    expect(generateRecurringExpense).not.toHaveBeenCalled();
    expect(advanceNextRun).not.toHaveBeenCalled();
    expect(summary.generated).toBe(0);
  });

  it("stops a template on a failed write instead of looping", async () => {
    generateRecurringExpense.mockResolvedValue({
      ok: false,
      error: { code: "EXTERNAL_API_ERROR" },
    });
    listDueTemplates.mockResolvedValue({ ok: true, value: [template({})] });

    const summary = await materializeDueRecurringExpenses("2026-09-01");

    expect(generateRecurringExpense).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ generated: 0, skipped: 1 });
  });
});
