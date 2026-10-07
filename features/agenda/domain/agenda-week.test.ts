import { describe, expect, it } from "vitest";

import {
  groupTasksByDay,
  shiftWeekStart,
  splitBacklog,
  summarizeWeek,
  weekContaining,
  weekdayIndex,
} from "@/features/agenda/domain/agenda-week";

import type { AgendaTask } from "@/features/agenda/domain/agenda-task";

const TODAY = "2026-10-07"; // Wednesday

let seq = 0;
const task = (over: Partial<AgendaTask>): AgendaTask => {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `İş ${seq}`,
    notes: null,
    category: "genel",
    due_date: TODAY,
    repeat: null,
    completed_at: null,
    recurrence_parent_id: null,
    created_by: null,
    created_at: new Date(Date.UTC(2026, 9, 1, 0, seq)),
    updated_at: new Date(Date.UTC(2026, 9, 1, 0, seq)),
    ...over,
  };
};

const DONE = new Date("2026-10-07T09:00:00Z");

describe("weekdayIndex", () => {
  it("is Monday-based", () => {
    expect(weekdayIndex("2026-10-05")).toBe(0); // Pazartesi
    expect(weekdayIndex("2026-10-07")).toBe(2); // Çarşamba
    expect(weekdayIndex("2026-10-11")).toBe(6); // Pazar
  });
});

describe("weekContaining", () => {
  it("returns Monday–Sunday around a midweek day", () => {
    const week = weekContaining(TODAY);
    expect(week.start).toBe("2026-10-05");
    expect(week.end).toBe("2026-10-11");
    expect(week.days).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
  });

  it("a Sunday belongs to the week that started the Monday before", () => {
    expect(weekContaining("2026-10-11").start).toBe("2026-10-05");
  });

  it("a Monday starts its own week", () => {
    expect(weekContaining("2026-10-12").start).toBe("2026-10-12");
  });

  it("spans month and year boundaries", () => {
    expect(weekContaining("2026-10-01")).toMatchObject({ start: "2026-09-28", end: "2026-10-04" });
    expect(weekContaining("2027-01-01")).toMatchObject({ start: "2026-12-28", end: "2027-01-03" });
  });
});

describe("shiftWeekStart", () => {
  it("moves whole weeks from the containing Monday", () => {
    expect(shiftWeekStart(TODAY, 1)).toBe("2026-10-12");
    expect(shiftWeekStart(TODAY, -1)).toBe("2026-09-28");
    expect(shiftWeekStart(TODAY, 0)).toBe("2026-10-05");
  });
});

describe("groupTasksByDay", () => {
  const week = weekContaining(TODAY);

  it("puts each dated task under its day and drops the rest", () => {
    const mon = task({ due_date: "2026-10-05" });
    const wed = task({ due_date: "2026-10-07" });
    const outside = task({ due_date: "2026-10-12" });
    const undated = task({ due_date: null });

    const byDay = groupTasksByDay([mon, wed, outside, undated], week);
    expect(byDay.size).toBe(7);
    expect(byDay.get("2026-10-05")).toEqual([mon]);
    expect(byDay.get("2026-10-07")).toEqual([wed]);
    expect(byDay.get("2026-10-06")).toEqual([]);
    expect([...byDay.values()].flat()).not.toContain(outside);
    expect([...byDay.values()].flat()).not.toContain(undated);
  });

  it("lists open tasks before completed ones, each oldest-created first", () => {
    const doneOld = task({ completed_at: DONE });
    const openOld = task({});
    const openNew = task({});
    const doneNew = task({ completed_at: DONE });

    const day = groupTasksByDay([doneNew, openNew, doneOld, openOld], week).get(TODAY);
    expect(day?.map((t) => t.id)).toEqual([openOld.id, openNew.id, doneOld.id, doneNew.id]);
  });
});

describe("splitBacklog", () => {
  it("open tasks before today are overdue; open undated ones are undated", () => {
    const overdue = task({ due_date: "2026-10-01" });
    const undated = task({ due_date: null });
    const todayTask = task({ due_date: TODAY });
    const future = task({ due_date: "2026-10-20" });

    const backlog = splitBacklog([overdue, undated, todayTask, future], TODAY);
    expect(backlog.overdue).toEqual([overdue]);
    expect(backlog.undated).toEqual([undated]);
  });

  it("ignores completed tasks", () => {
    const backlog = splitBacklog(
      [task({ due_date: "2026-10-01", completed_at: DONE }), task({ due_date: null, completed_at: DONE })],
      TODAY,
    );
    expect(backlog.overdue).toEqual([]);
    expect(backlog.undated).toEqual([]);
  });

  it("orders overdue oldest date first and undated newest first", () => {
    const late2 = task({ due_date: "2026-10-03" });
    const late1 = task({ due_date: "2026-09-20" });
    const undatedOld = task({ due_date: null });
    const undatedNew = task({ due_date: null });

    const backlog = splitBacklog([late2, undatedOld, late1, undatedNew], TODAY);
    expect(backlog.overdue.map((t) => t.id)).toEqual([late1.id, late2.id]);
    expect(backlog.undated.map((t) => t.id)).toEqual([undatedNew.id, undatedOld.id]);
  });
});

describe("summarizeWeek", () => {
  const week = weekContaining(TODAY);

  it("counts today's open tasks and the week's done/total", () => {
    const summary = summarizeWeek(
      [
        task({ due_date: TODAY }),
        task({ due_date: TODAY }),
        task({ due_date: TODAY, completed_at: DONE }),
        task({ due_date: "2026-10-05", completed_at: DONE }),
        task({ due_date: "2026-10-09" }),
        task({ due_date: "2026-10-14" }), // next week — ignored
        task({ due_date: null }), // undated — ignored
      ],
      week,
      TODAY,
    );
    expect(summary).toEqual({ openToday: 2, doneThisWeek: 2, totalThisWeek: 5 });
  });

  it("an empty week is all zeros", () => {
    expect(summarizeWeek([], week, TODAY)).toEqual({ openToday: 0, doneThisWeek: 0, totalThisWeek: 0 });
  });
});
