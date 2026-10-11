import { describe, expect, it } from "vitest";

import {
  addMonthsToYmd,
  istanbulInstant,
  istanbulMinutesOfDay,
  mondayIndexOfYmd,
  startOfMonthYmd,
  startOfWeekYmd,
} from "@/shared/utils/date";
import {
  describeRepeatRule,
  firstOccurrenceIndexOnOrAfter,
  nextOccurrenceAfter,
  occurrenceYmd,
} from "@/shared/utils/repeat-rule";

describe("date helpers", () => {
  it("addMonthsToYmd adds within and across years", () => {
    expect(addMonthsToYmd("2026-10-07", 1)).toBe("2026-11-07");
    expect(addMonthsToYmd("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonthsToYmd("2026-01-15", -2)).toBe("2025-11-15");
  });

  it("addMonthsToYmd clamps to the target month's last day", () => {
    expect(addMonthsToYmd("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToYmd("2028-01-31", 1)).toBe("2028-02-29"); // leap year
    expect(addMonthsToYmd("2026-03-31", 1)).toBe("2026-04-30");
  });

  it("istanbulInstant is the UTC instant of an Istanbul wall-clock time", () => {
    expect(istanbulInstant("2026-10-11").toISOString()).toBe("2026-10-10T21:00:00.000Z");
    expect(istanbulInstant("2026-10-11", "14:30").toISOString()).toBe("2026-10-11T11:30:00.000Z");
  });

  it("istanbulMinutesOfDay reads the Istanbul clock, not UTC", () => {
    expect(istanbulMinutesOfDay("2026-10-10T21:00:00.000Z")).toBe(0);
    expect(istanbulMinutesOfDay(istanbulInstant("2026-10-11", "14:30"))).toBe(14 * 60 + 30);
  });

  it("weeks start on Monday", () => {
    expect(mondayIndexOfYmd("2026-10-05")).toBe(0); // Pazartesi
    expect(mondayIndexOfYmd("2026-10-11")).toBe(6); // Pazar
    expect(startOfWeekYmd("2026-10-11")).toBe("2026-10-05");
    expect(startOfWeekYmd("2026-10-05")).toBe("2026-10-05");
    expect(startOfMonthYmd("2026-10-11")).toBe("2026-10-01");
  });
});

describe("occurrenceYmd", () => {
  it("k = 0 is the anchor", () => {
    expect(occurrenceYmd("2026-10-05", { unit: "week", every: 1 }, 0)).toBe("2026-10-05");
  });

  it("steps days, weeks, months and years", () => {
    expect(occurrenceYmd("2026-10-05", { unit: "day", every: 3 }, 2)).toBe("2026-10-11");
    expect(occurrenceYmd("2026-10-05", { unit: "week", every: 2 }, 1)).toBe("2026-10-19");
    expect(occurrenceYmd("2026-10-05", { unit: "month", every: 3 }, 1)).toBe("2027-01-05");
    expect(occurrenceYmd("2026-10-05", { unit: "year", every: 1 }, 2)).toBe("2028-10-05");
  });

  it("jumps k·n months from the anchor in one step (clamped, not chained)", () => {
    const rule = { unit: "month", every: 1 } as const;
    expect(occurrenceYmd("2026-01-31", rule, 1)).toBe("2026-02-28");
    expect(occurrenceYmd("2026-01-31", rule, 2)).toBe("2026-03-31");
  });

  it("a 29 Şubat yearly series clamps in common years and returns in leap years", () => {
    const rule = { unit: "year", every: 1 } as const;
    expect(occurrenceYmd("2028-02-29", rule, 1)).toBe("2029-02-28");
    expect(occurrenceYmd("2028-02-29", rule, 4)).toBe("2032-02-29");
  });
});

describe("firstOccurrenceIndexOnOrAfter", () => {
  it("is 0 for any day on or before the anchor", () => {
    expect(firstOccurrenceIndexOnOrAfter("2026-10-05", { unit: "week", every: 1 }, "2026-10-05")).toBe(0);
    expect(firstOccurrenceIndexOnOrAfter("2026-10-05", { unit: "week", every: 1 }, "2026-01-01")).toBe(0);
    expect(firstOccurrenceIndexOnOrAfter("2026-10-05", { unit: "month", every: 1 }, "2025-01-01")).toBe(0);
  });

  it("day-based units round up to the next slot", () => {
    const rule = { unit: "day", every: 3 } as const; // 1, 4, 7, 10
    expect(firstOccurrenceIndexOnOrAfter("2026-10-01", rule, "2026-10-04")).toBe(1);
    expect(firstOccurrenceIndexOnOrAfter("2026-10-01", rule, "2026-10-05")).toBe(2);
    expect(firstOccurrenceIndexOnOrAfter("2026-10-01", rule, "2026-10-07")).toBe(2);
  });

  it("month-based units account for the day within the month", () => {
    const rule = { unit: "month", every: 1 } as const;
    expect(firstOccurrenceIndexOnOrAfter("2026-06-15", rule, "2026-10-07")).toBe(4); // 15 Eki
    expect(firstOccurrenceIndexOnOrAfter("2026-06-15", rule, "2026-10-15")).toBe(4);
    expect(firstOccurrenceIndexOnOrAfter("2026-06-15", rule, "2026-10-16")).toBe(5);
  });

  it("the returned occurrence is the first one not before the day", () => {
    const rules = [
      { unit: "day", every: 1 },
      { unit: "day", every: 5 },
      { unit: "week", every: 3 },
      { unit: "month", every: 1 },
      { unit: "month", every: 6 },
      { unit: "year", every: 1 },
    ] as const;
    const anchors = ["2025-12-31", "2026-01-31", "2026-02-28", "2026-10-07"];
    const days = ["2026-01-01", "2026-03-31", "2026-10-07", "2027-05-15", "2031-02-28"];
    for (const rule of rules) {
      for (const anchor of anchors) {
        for (const day of days) {
          const k = firstOccurrenceIndexOnOrAfter(anchor, rule, day);
          const label = `${anchor} ${rule.unit}×${rule.every} @ ${day} → k=${k}`;
          expect(occurrenceYmd(anchor, rule, k) >= day, label).toBe(true);
          if (k > 0) expect(occurrenceYmd(anchor, rule, k - 1) < day, label).toBe(true);
        }
      }
    }
  });
});

describe("nextOccurrenceAfter", () => {
  describe("daily", () => {
    const rule = { unit: "day", every: 1 } as const;

    it("done on the day → tomorrow", () => {
      expect(nextOccurrenceAfter("2026-10-07", rule, "2026-10-07")).toBe("2026-10-08");
    });

    it("done days late → tomorrow, not a back-filled overdue date", () => {
      expect(nextOccurrenceAfter("2026-10-01", rule, "2026-10-07")).toBe("2026-10-08");
    });

    it("every 3 days stays on the original cadence when late", () => {
      // 1 → 4 → 7 → 10: 7 is today, so the next slot is 10.
      expect(nextOccurrenceAfter("2026-10-01", { unit: "day", every: 3 }, "2026-10-07")).toBe("2026-10-10");
      // 1 → 4 → 7: done on the 5th → 7.
      expect(nextOccurrenceAfter("2026-10-01", { unit: "day", every: 3 }, "2026-10-05")).toBe("2026-10-07");
    });
  });

  describe("weekly", () => {
    const rule = { unit: "week", every: 1 } as const;

    it("Monday task done on Monday → next Monday", () => {
      expect(nextOccurrenceAfter("2026-10-05", rule, "2026-10-05")).toBe("2026-10-12");
    });

    it("done early (before its day) → the next slot after the due date", () => {
      expect(nextOccurrenceAfter("2026-10-12", rule, "2026-10-08")).toBe("2026-10-19");
    });

    it("done weeks late → skips missed Mondays, keeps the weekday", () => {
      expect(nextOccurrenceAfter("2026-09-07", rule, "2026-10-07")).toBe("2026-10-12");
    });

    it("done exactly one interval late → the slot after today", () => {
      expect(nextOccurrenceAfter("2026-10-05", rule, "2026-10-12")).toBe("2026-10-19");
    });

    it("every 2 weeks", () => {
      expect(nextOccurrenceAfter("2026-10-05", { unit: "week", every: 2 }, "2026-10-05")).toBe("2026-10-19");
    });
  });

  describe("monthly and yearly", () => {
    it("every 3 months (e.g. deworming) done on time", () => {
      expect(nextOccurrenceAfter("2026-10-07", { unit: "month", every: 3 }, "2026-10-07")).toBe("2027-01-07");
    });

    it("done early in the month → the next interval", () => {
      expect(nextOccurrenceAfter("2026-10-20", { unit: "month", every: 1 }, "2026-10-07")).toBe("2026-11-20");
    });

    it("done months late → skips missed months", () => {
      expect(nextOccurrenceAfter("2026-06-15", { unit: "month", every: 1 }, "2026-10-07")).toBe("2026-10-15");
      expect(nextOccurrenceAfter("2026-06-15", { unit: "month", every: 1 }, "2026-10-20")).toBe("2026-11-15");
    });

    it("a month-end date clamps to a short month's last day", () => {
      const rule = { unit: "month", every: 1 } as const;
      expect(nextOccurrenceAfter("2026-01-31", rule, "2026-01-31")).toBe("2026-02-28");
      // Skipping missed months still jumps from the stored date in one step.
      expect(nextOccurrenceAfter("2026-01-31", rule, "2026-03-15")).toBe("2026-03-31");
    });

    it("yearly", () => {
      const rule = { unit: "year", every: 1 } as const;
      expect(nextOccurrenceAfter("2026-10-07", rule, "2026-10-07")).toBe("2027-10-07");
      expect(nextOccurrenceAfter("2024-10-07", rule, "2026-10-08")).toBe("2027-10-07");
    });
  });

  it("the result is always strictly after both today and the anchor", () => {
    const rules = [
      { unit: "day", every: 1 },
      { unit: "day", every: 5 },
      { unit: "week", every: 1 },
      { unit: "week", every: 3 },
      { unit: "month", every: 1 },
      { unit: "month", every: 6 },
      { unit: "year", every: 2 },
    ] as const;
    const anchors = ["2025-12-31", "2026-02-28", "2026-10-07", "2026-11-30"];
    const todays = ["2026-01-01", "2026-03-31", "2026-10-07", "2027-05-15"];
    for (const rule of rules) {
      for (const anchor of anchors) {
        for (const today of todays) {
          const next = nextOccurrenceAfter(anchor, rule, today);
          expect(next > today, `${anchor} ${rule.unit}×${rule.every} @ ${today} → ${next}`).toBe(true);
          expect(next > anchor).toBe(true);
        }
      }
    }
  });
});

describe("describeRepeatRule", () => {
  it("reads naturally in Turkish", () => {
    expect(describeRepeatRule({ unit: "day", every: 1 })).toBe("Her gün");
    expect(describeRepeatRule({ unit: "week", every: 2 })).toBe("2 haftada bir");
    expect(describeRepeatRule({ unit: "month", every: 3 })).toBe("3 ayda bir");
    expect(describeRepeatRule({ unit: "year", every: 1 })).toBe("Her yıl");
  });
});
