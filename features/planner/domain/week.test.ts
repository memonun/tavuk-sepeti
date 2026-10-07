import { describe, expect, it } from "vitest";

import {
  addDaysIso,
  startOfIsoWeek,
  weekDays,
  weekdayLabel,
} from "@/features/planner/domain/week";

describe("addDaysIso", () => {
  it("adds and subtracts whole days without DST drift", () => {
    expect(addDaysIso("2026-10-07", 1)).toBe("2026-10-08");
    expect(addDaysIso("2026-10-07", -1)).toBe("2026-10-06");
  });

  it("crosses a month/year boundary correctly", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("startOfIsoWeek", () => {
  it("returns the same date when it is already a Monday", () => {
    // 2026-10-05 is a Monday.
    expect(startOfIsoWeek("2026-10-05")).toBe("2026-10-05");
  });

  it("rewinds a mid-week date to its Monday", () => {
    // 2026-10-07 is a Wednesday.
    expect(startOfIsoWeek("2026-10-07")).toBe("2026-10-05");
  });

  it("rewinds a Sunday to the Monday that started its own week", () => {
    // 2026-10-11 is a Sunday — belongs to the week that started 2026-10-05,
    // not the one starting 2026-10-12.
    expect(startOfIsoWeek("2026-10-11")).toBe("2026-10-05");
  });
});

describe("weekDays", () => {
  it("lists all 7 days Mon..Sun from the given Monday", () => {
    expect(weekDays("2026-10-05")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
  });
});

describe("weekdayLabel", () => {
  it("maps 0..6 to Pazartesi..Pazar", () => {
    expect(weekdayLabel(0)).toBe("Pazartesi");
    expect(weekdayLabel(6)).toBe("Pazar");
  });
});
