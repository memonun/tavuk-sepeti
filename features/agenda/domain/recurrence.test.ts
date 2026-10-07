import { describe, expect, it } from "vitest";

import {
  addMonthsToYmd,
  nextOccurrence,
  occurrenceAt,
} from "@/features/agenda/domain/recurrence";

describe("addMonthsToYmd", () => {
  it("adds months within a year and across year boundaries", () => {
    expect(addMonthsToYmd("2026-10-07", 1)).toBe("2026-11-07");
    expect(addMonthsToYmd("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonthsToYmd("2026-01-15", -2)).toBe("2025-11-15");
  });

  it("clamps the day to the target month's last day", () => {
    expect(addMonthsToYmd("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToYmd("2028-01-31", 1)).toBe("2028-02-29"); // leap year
    expect(addMonthsToYmd("2026-03-31", 1)).toBe("2026-04-30");
  });
});

describe("occurrenceAt", () => {
  it("k = 0 is the original date", () => {
    expect(occurrenceAt("2026-10-05", { unit: "week", every: 1 }, 0)).toBe("2026-10-05");
  });

  it("jumps k·n months from the date in one step (clamped, not chained)", () => {
    const rule = { unit: "month", every: 1 } as const;
    expect(occurrenceAt("2026-01-31", rule, 1)).toBe("2026-02-28");
    expect(occurrenceAt("2026-01-31", rule, 2)).toBe("2026-03-31");
  });
});

describe("nextOccurrence", () => {
  describe("daily", () => {
    const rule = { unit: "day", every: 1 } as const;

    it("done on the day → tomorrow", () => {
      expect(nextOccurrence("2026-10-07", rule, "2026-10-07")).toBe("2026-10-08");
    });

    it("done days late → tomorrow, not a back-filled overdue date", () => {
      expect(nextOccurrence("2026-10-01", rule, "2026-10-07")).toBe("2026-10-08");
    });

    it("every 3 days stays on the original cadence when late", () => {
      // 1 → 4 → 7 → 10: 7 is today, so the next slot is 10.
      expect(nextOccurrence("2026-10-01", { unit: "day", every: 3 }, "2026-10-07")).toBe("2026-10-10");
      // 1 → 4 → 7: done on the 5th → 7.
      expect(nextOccurrence("2026-10-01", { unit: "day", every: 3 }, "2026-10-05")).toBe("2026-10-07");
    });
  });

  describe("weekly", () => {
    const rule = { unit: "week", every: 1 } as const;

    it("Monday task done on Monday → next Monday", () => {
      expect(nextOccurrence("2026-10-05", rule, "2026-10-05")).toBe("2026-10-12");
    });

    it("done early (before its day) → the next slot after the due date", () => {
      expect(nextOccurrence("2026-10-12", rule, "2026-10-08")).toBe("2026-10-19");
    });

    it("done a few days late → still the coming Monday", () => {
      expect(nextOccurrence("2026-10-05", rule, "2026-10-08")).toBe("2026-10-12");
    });

    it("done weeks late → skips missed Mondays, keeps the weekday", () => {
      expect(nextOccurrence("2026-09-07", rule, "2026-10-07")).toBe("2026-10-12");
    });

    it("done exactly one interval late → the slot after today", () => {
      expect(nextOccurrence("2026-10-05", rule, "2026-10-12")).toBe("2026-10-19");
    });

    it("every 2 weeks", () => {
      expect(nextOccurrence("2026-10-05", { unit: "week", every: 2 }, "2026-10-05")).toBe("2026-10-19");
    });
  });

  describe("monthly", () => {
    it("every 3 months (e.g. deworming) done on time", () => {
      expect(nextOccurrence("2026-10-07", { unit: "month", every: 3 }, "2026-10-07")).toBe("2027-01-07");
    });

    it("done early in the month → the next interval", () => {
      expect(nextOccurrence("2026-10-20", { unit: "month", every: 1 }, "2026-10-07")).toBe("2026-11-20");
    });

    it("done late within the same month → next month", () => {
      expect(nextOccurrence("2026-10-01", { unit: "month", every: 1 }, "2026-10-25")).toBe("2026-11-01");
    });

    it("done months late → skips missed months", () => {
      expect(nextOccurrence("2026-06-15", { unit: "month", every: 1 }, "2026-10-07")).toBe("2026-10-15");
      expect(nextOccurrence("2026-06-15", { unit: "month", every: 1 }, "2026-10-20")).toBe("2026-11-15");
    });

    it("every 3 months done late skips whole intervals", () => {
      // 01-10 → 04-10 → 07-10 → 10-10: today 10-07 → 10-10.
      expect(nextOccurrence("2026-01-10", { unit: "month", every: 3 }, "2026-10-07")).toBe("2026-10-10");
      // today 10-12 → 10-10 has passed → 2027-01-10.
      expect(nextOccurrence("2026-01-10", { unit: "month", every: 3 }, "2026-10-12")).toBe("2027-01-10");
    });

    it("a month-end date clamps to a short month's last day", () => {
      const rule = { unit: "month", every: 1 } as const;
      expect(nextOccurrence("2026-01-31", rule, "2026-01-31")).toBe("2026-02-28");
      // The spawned row carries 28 Şub as its own date, so the series
      // continues from the 28th.
      expect(nextOccurrence("2026-02-28", rule, "2026-02-28")).toBe("2026-03-28");
      // Skipping missed months still jumps from the stored date in one step.
      expect(nextOccurrence("2026-01-31", rule, "2026-03-15")).toBe("2026-03-31");
    });

    it("across a year boundary", () => {
      expect(nextOccurrence("2026-12-15", { unit: "month", every: 1 }, "2026-12-15")).toBe("2027-01-15");
    });
  });

  it("the result is always strictly after today", () => {
    const rules = [
      { unit: "day", every: 1 },
      { unit: "day", every: 5 },
      { unit: "week", every: 1 },
      { unit: "week", every: 3 },
      { unit: "month", every: 1 },
      { unit: "month", every: 6 },
    ] as const;
    const dues = ["2025-12-31", "2026-02-28", "2026-10-07", "2026-11-30"];
    const todays = ["2026-01-01", "2026-03-31", "2026-10-07", "2027-05-15"];
    for (const rule of rules) {
      for (const due of dues) {
        for (const today of todays) {
          const next = nextOccurrence(due, rule, today);
          expect(next > today, `${due} ${rule.unit}×${rule.every} @ ${today} → ${next}`).toBe(true);
          expect(next > due).toBe(true);
        }
      }
    }
  });
});
