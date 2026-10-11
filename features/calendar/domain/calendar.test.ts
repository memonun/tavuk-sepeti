import { describe, expect, it } from "vitest";

import {
  calendarPageQuerySchema,
  calendarRangeSchema,
  createCalendarSchema,
  createEventSchema,
  eventFormValues,
  resolveEventColumns,
  type CreateEventInput,
} from "@/features/calendar/domain/calendar.schema";
import {
  expandEvent,
  expandEvents,
  groupOccurrencesByDay,
  occurrenceDays,
} from "@/features/calendar/domain/occurrences";
import { isSameMonth, shiftDate, visibleRange } from "@/features/calendar/domain/range";
import {
  clipToDay,
  daySegments,
  layoutDaySegments,
  type DaySegment,
} from "@/features/calendar/domain/time-grid";
import { istanbulInstant } from "@/shared/utils/date";

import type { CalendarEvent } from "@/features/calendar/domain/calendar";

const CAL = "11111111-1111-4111-8111-111111111111";
const iso = (ymd: string, hhmm = "00:00") => istanbulInstant(ymd, hhmm).toISOString();

function event(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    calendar_id: CAL,
    title: overrides.id,
    notes: null,
    location: null,
    all_day: false,
    starts_at: iso("2026-10-12", "09:00"),
    ends_at: iso("2026-10-12", "10:00"),
    repeat: null,
    repeat_until: null,
    ...overrides,
  };
}

const NONE: ReadonlySet<string> = new Set();

describe("visibleRange", () => {
  it("a month is six full Monday-first weeks around it", () => {
    const range = visibleRange("ay", "2026-10-11");
    expect(range.start).toBe("2026-09-28"); // Pazartesi before 1 Ekim (Perşembe)
    expect(range.end).toBe("2026-11-09");
    expect(range.days).toHaveLength(42);
    expect(range.days[0]).toBe("2026-09-28");
    expect(range.days[41]).toBe("2026-11-08");
  });

  it("a month starting on a Monday starts on its own first day", () => {
    expect(visibleRange("ay", "2026-06-15").start).toBe("2026-06-01");
  });

  it("a week runs Monday to Sunday", () => {
    const range = visibleRange("hafta", "2026-10-11"); // Pazar
    expect(range.days).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    expect(range.end).toBe("2026-10-12");
  });

  it("a day is just that day", () => {
    expect(visibleRange("gun", "2026-10-11")).toMatchObject({
      start: "2026-10-11",
      end: "2026-10-12",
      days: ["2026-10-11"],
    });
  });

  it("shiftDate steps by the view's own unit", () => {
    expect(shiftDate("gun", "2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDate("hafta", "2026-10-11", -1)).toBe("2026-10-04");
    expect(shiftDate("ay", "2026-10-11", 1)).toBe("2026-11-11");
    expect(shiftDate("ay", "2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftDate("ay", "2026-01-15", -1)).toBe("2025-12-15");
  });

  it("isSameMonth", () => {
    expect(isSameMonth("2026-09-30", "2026-10-11")).toBe(false);
    expect(isSameMonth("2026-10-01", "2026-10-11")).toBe(true);
  });
});

describe("expandEvent", () => {
  const rangeStart = istanbulInstant("2026-10-05");
  const rangeEnd = istanbulInstant("2026-10-12");

  it("a one-off event appears once when it overlaps the range", () => {
    const inside = event({ id: "a", starts_at: iso("2026-10-07", "09:00"), ends_at: iso("2026-10-07", "10:00") });
    const result = expandEvent(inside, NONE, rangeStart, rangeEnd);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      key: "a:2026-10-07",
      occurrence_date: "2026-10-07",
      repeat: null,
      starts_at: iso("2026-10-07", "09:00"),
    });
  });

  it("a one-off event outside the range does not appear; the end is exclusive", () => {
    const before = event({ id: "a", starts_at: iso("2026-10-04", "09:00"), ends_at: iso("2026-10-05") });
    const after = event({ id: "b", starts_at: iso("2026-10-12"), ends_at: iso("2026-10-12", "01:00") });
    expect(expandEvent(before, NONE, rangeStart, rangeEnd)).toEqual([]);
    expect(expandEvent(after, NONE, rangeStart, rangeEnd)).toEqual([]);
  });

  it("an event that started before the range but runs into it appears", () => {
    const spanning = event({ id: "a", starts_at: iso("2026-10-04", "22:00"), ends_at: iso("2026-10-05", "02:00") });
    expect(expandEvent(spanning, NONE, rangeStart, rangeEnd)).toHaveLength(1);
  });

  it("a daily event yields one occurrence per visible day at its own time", () => {
    const daily = event({
      id: "d",
      starts_at: iso("2026-10-01", "07:30"),
      ends_at: iso("2026-10-01", "08:00"),
      repeat: { unit: "day", every: 1 },
    });
    const result = expandEvent(daily, NONE, rangeStart, rangeEnd);
    expect(result.map((o) => o.occurrence_date)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    expect(result[0]).toMatchObject({
      starts_at: iso("2026-10-05", "07:30"),
      ends_at: iso("2026-10-05", "08:00"),
      repeat: { unit: "day", every: 1 },
      // The series' own span travels with every occurrence.
      series_starts_at: iso("2026-10-01", "07:30"),
      series_ends_at: iso("2026-10-01", "08:00"),
    });
  });

  it("a series that starts inside the range begins at its first occurrence", () => {
    const weekly = event({
      id: "w",
      starts_at: iso("2026-10-08", "09:00"),
      ends_at: iso("2026-10-08", "10:00"),
      repeat: { unit: "week", every: 1 },
    });
    expect(expandEvent(weekly, NONE, rangeStart, rangeEnd).map((o) => o.occurrence_date)).toEqual([
      "2026-10-08",
    ]);
  });

  it("a series that has not started yet yields nothing", () => {
    const future = event({
      id: "w",
      starts_at: iso("2026-11-01", "09:00"),
      ends_at: iso("2026-11-01", "10:00"),
      repeat: { unit: "week", every: 1 },
    });
    expect(expandEvent(future, NONE, rangeStart, rangeEnd)).toEqual([]);
  });

  it("every 2 weeks skips the off weeks", () => {
    const biweekly = event({
      id: "b",
      starts_at: iso("2026-09-28", "09:00"),
      ends_at: iso("2026-09-28", "10:00"),
      repeat: { unit: "week", every: 2 },
    });
    // 28 Eyl, 12 Eki, 26 Eki … — nothing in 5–11 Eki.
    expect(expandEvent(biweekly, NONE, rangeStart, rangeEnd)).toEqual([]);
    const next = expandEvent(biweekly, NONE, istanbulInstant("2026-10-12"), istanbulInstant("2026-10-19"));
    expect(next.map((o) => o.occurrence_date)).toEqual(["2026-10-12"]);
  });

  it("repeat_until is the last day an occurrence may start on", () => {
    const daily = event({
      id: "d",
      starts_at: iso("2026-10-01", "07:30"),
      ends_at: iso("2026-10-01", "08:00"),
      repeat: { unit: "day", every: 1 },
      repeat_until: "2026-10-07",
    });
    expect(expandEvent(daily, NONE, rangeStart, rangeEnd).map((o) => o.occurrence_date)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ]);
  });

  it("skipped days are left out", () => {
    const daily = event({
      id: "d",
      starts_at: iso("2026-10-01", "07:30"),
      ends_at: iso("2026-10-01", "08:00"),
      repeat: { unit: "day", every: 1 },
      repeat_until: "2026-10-07",
    });
    const result = expandEvent(daily, new Set(["2026-10-06"]), rangeStart, rangeEnd);
    expect(result.map((o) => o.occurrence_date)).toEqual(["2026-10-05", "2026-10-07"]);
  });

  it("a monthly event on the 31st clamps in short months and returns to the 31st", () => {
    const monthly = event({
      id: "m",
      all_day: true,
      starts_at: iso("2026-01-31"),
      ends_at: iso("2026-02-01"),
      repeat: { unit: "month", every: 1 },
    });
    const feb = expandEvent(monthly, NONE, istanbulInstant("2026-02-01"), istanbulInstant("2026-03-01"));
    const mar = expandEvent(monthly, NONE, istanbulInstant("2026-03-01"), istanbulInstant("2026-04-01"));
    expect(feb.map((o) => o.occurrence_date)).toEqual(["2026-02-28"]);
    expect(mar.map((o) => o.occurrence_date)).toEqual(["2026-03-31"]);
  });

  it("a multi-day repeating occurrence that began before the range still shows", () => {
    const fair = event({
      id: "f",
      all_day: true,
      starts_at: iso("2026-10-03"),
      ends_at: iso("2026-10-06"), // 3, 4, 5 Ekim
      repeat: { unit: "year", every: 1 },
    });
    const result = expandEvent(fair, NONE, rangeStart, rangeEnd);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ occurrence_date: "2026-10-03", ends_at: iso("2026-10-06") });
  });
});

describe("expandEvents / grouping", () => {
  it("orders all-day first, then by start, then by title", () => {
    const occurrences = expandEvents(
      [
        event({ id: "late", starts_at: iso("2026-10-07", "15:00"), ends_at: iso("2026-10-07", "16:00") }),
        event({ id: "zeta", starts_at: iso("2026-10-07", "09:00"), ends_at: iso("2026-10-07", "10:00") }),
        event({ id: "alfa", starts_at: iso("2026-10-07", "09:00"), ends_at: iso("2026-10-07", "10:00") }),
        event({ id: "allday", all_day: true, starts_at: iso("2026-10-07"), ends_at: iso("2026-10-08") }),
      ],
      new Map(),
      istanbulInstant("2026-10-05"),
      istanbulInstant("2026-10-12"),
    );
    expect(occurrences.map((o) => o.event_id)).toEqual(["allday", "alfa", "zeta", "late"]);
  });

  it("applies each event's own skipped days", () => {
    const daily = event({
      id: "d",
      starts_at: iso("2026-10-05", "07:00"),
      ends_at: iso("2026-10-05", "08:00"),
      repeat: { unit: "day", every: 1 },
    });
    const occurrences = expandEvents(
      [daily],
      new Map([["d", new Set(["2026-10-06"])]]),
      istanbulInstant("2026-10-05"),
      istanbulInstant("2026-10-08"),
    );
    expect(occurrences.map((o) => o.occurrence_date)).toEqual(["2026-10-05", "2026-10-07"]);
  });

  it("occurrenceDays: an all-day event covers its days, not the day it ends on", () => {
    expect(occurrenceDays({ starts_at: iso("2026-10-03"), ends_at: iso("2026-10-06") })).toEqual([
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
    ]);
  });

  it("occurrenceDays: a timed event ending at midnight stays on its own day", () => {
    expect(
      occurrenceDays({ starts_at: iso("2026-10-07", "22:00"), ends_at: iso("2026-10-08") }),
    ).toEqual(["2026-10-07"]);
    expect(
      occurrenceDays({ starts_at: iso("2026-10-07", "22:00"), ends_at: iso("2026-10-08", "01:00") }),
    ).toEqual(["2026-10-07", "2026-10-08"]);
  });

  it("groupOccurrencesByDay buckets under every visible day touched", () => {
    const occurrences = expandEvents(
      [
        event({ id: "fair", all_day: true, starts_at: iso("2026-10-06"), ends_at: iso("2026-10-08") }),
        event({ id: "vet", starts_at: iso("2026-10-07", "09:00"), ends_at: iso("2026-10-07", "10:00") }),
      ],
      new Map(),
      istanbulInstant("2026-10-05"),
      istanbulInstant("2026-10-12"),
    );
    const byDay = groupOccurrencesByDay(occurrences, ["2026-10-06", "2026-10-07", "2026-10-08"]);
    expect(byDay.get("2026-10-06")?.map((o) => o.event_id)).toEqual(["fair"]);
    expect(byDay.get("2026-10-07")?.map((o) => o.event_id)).toEqual(["fair", "vet"]);
    expect(byDay.get("2026-10-08")).toEqual([]);
  });
});

describe("time grid", () => {
  it("clipToDay cuts a span to the day's 24 hours", () => {
    expect(clipToDay(iso("2026-10-07", "09:00"), iso("2026-10-07", "10:30"), "2026-10-07")).toEqual({
      startMin: 540,
      endMin: 630,
    });
    // Runs past midnight: clipped on both days.
    expect(clipToDay(iso("2026-10-07", "22:00"), iso("2026-10-08", "01:00"), "2026-10-07")).toEqual({
      startMin: 1320,
      endMin: 1440,
    });
    expect(clipToDay(iso("2026-10-07", "22:00"), iso("2026-10-08", "01:00"), "2026-10-08")).toEqual({
      startMin: 0,
      endMin: 60,
    });
    expect(clipToDay(iso("2026-10-07", "22:00"), iso("2026-10-08"), "2026-10-08")).toBeNull();
    expect(clipToDay(iso("2026-10-07", "09:00"), iso("2026-10-07", "10:00"), "2026-10-09")).toBeNull();
  });

  it("daySegments leaves all-day occurrences out", () => {
    const occurrences = expandEvents(
      [
        event({ id: "allday", all_day: true, starts_at: iso("2026-10-07"), ends_at: iso("2026-10-08") }),
        event({ id: "vet", starts_at: iso("2026-10-07", "09:00"), ends_at: iso("2026-10-07", "10:00") }),
      ],
      new Map(),
      istanbulInstant("2026-10-07"),
      istanbulInstant("2026-10-08"),
    );
    expect(daySegments(occurrences, "2026-10-07").map((s) => s.item.event_id)).toEqual(["vet"]);
  });

  const seg = (item: string, startMin: number, endMin: number): DaySegment<string> => ({
    item,
    startMin,
    endMin,
  });
  const byItem = (segments: readonly { item: string; column: number; columns: number }[]) =>
    Object.fromEntries(segments.map((s) => [s.item, [s.column, s.columns]]));

  it("events that do not overlap each take the full width", () => {
    const placed = layoutDaySegments([seg("a", 540, 600), seg("b", 600, 660)]);
    expect(byItem(placed)).toEqual({ a: [0, 1], b: [0, 1] });
  });

  it("two overlapping events split the width", () => {
    const placed = layoutDaySegments([seg("a", 540, 660), seg("b", 600, 720)]);
    expect(byItem(placed)).toEqual({ a: [0, 2], b: [1, 2] });
  });

  it("a column is reused once it frees up, and the cluster shares one width", () => {
    // a: 9–11, b: 9–10, c: 10–11 → c drops into b's column; all are 1/2 wide.
    const placed = layoutDaySegments([seg("a", 540, 660), seg("b", 540, 600), seg("c", 600, 660)]);
    expect(byItem(placed)).toEqual({ a: [0, 2], b: [1, 2], c: [1, 2] });
  });

  it("a later separate group is laid out on its own", () => {
    const placed = layoutDaySegments([
      seg("a", 540, 600),
      seg("b", 540, 600),
      seg("c", 540, 600),
      seg("d", 900, 960),
    ]);
    expect(byItem(placed)).toEqual({ a: [0, 3], b: [1, 3], c: [2, 3], d: [0, 1] });
  });

  it("very short events collide as if they were half an hour long", () => {
    const placed = layoutDaySegments([seg("a", 540, 545), seg("b", 550, 555)]);
    expect(byItem(placed)).toEqual({ a: [0, 2], b: [1, 2] });
  });
});

describe("event schema", () => {
  const base: CreateEventInput = {
    calendar_id: CAL,
    title: "  Veteriner  ",
    start_date: "2026-10-12",
    start_time: "09:00",
    end_time: "10:30",
  };
  const resolve = (input: CreateEventInput) => resolveEventColumns(createEventSchema.parse(input));

  it("a timed event resolves to exact instants", () => {
    expect(resolve(base)).toEqual({
      ok: true,
      value: {
        calendar_id: CAL,
        title: "Veteriner",
        notes: null,
        location: null,
        all_day: false,
        starts_at: iso("2026-10-12", "09:00"),
        ends_at: iso("2026-10-12", "10:30"),
        repeat: null,
        repeat_until: null,
      },
    });
  });

  it("a timed event without an end lasts an hour", () => {
    expect(resolve({ ...base, end_time: "" })).toMatchObject({
      value: { ends_at: iso("2026-10-12", "10:00") },
    });
  });

  it("an all-day event stores an exclusive end at the midnight after its last day", () => {
    expect(resolve({ ...base, all_day: true, end_date: "2026-10-14" })).toMatchObject({
      value: { all_day: true, starts_at: iso("2026-10-12"), ends_at: iso("2026-10-15") },
    });
    // Times are ignored for all-day events.
    expect(resolve({ ...base, all_day: true })).toMatchObject({
      value: { starts_at: iso("2026-10-12"), ends_at: iso("2026-10-13") },
    });
  });

  it("an event may run past midnight", () => {
    expect(resolve({ ...base, start_time: "22:00", end_date: "2026-10-13", end_time: "01:00" })).toMatchObject({
      value: { starts_at: iso("2026-10-12", "22:00"), ends_at: iso("2026-10-13", "01:00") },
    });
  });

  it("rejects an end that is not after the start", () => {
    expect(resolve({ ...base, end_time: "09:00" })).toEqual({
      ok: false,
      error: "Bitiş, başlangıçtan sonra olmalı.",
    });
    expect(resolve({ ...base, end_date: "2026-10-11" })).toEqual({
      ok: false,
      error: "Bitiş, başlangıçtan önce olamaz.",
    });
    expect(resolve({ ...base, all_day: true, end_date: "2026-10-11" })).toMatchObject({ ok: false });
  });

  it("a timed event needs a start time", () => {
    expect(resolve({ ...base, start_time: null })).toEqual({ ok: false, error: "Başlangıç saati gerekli." });
  });

  it("rejects an absurdly long event", () => {
    expect(resolve({ ...base, all_day: true, end_date: "2028-10-12" })).toMatchObject({ ok: false });
  });

  it("a repeat unit alone means every 1; an end date needs a rule", () => {
    expect(resolve({ ...base, repeat_unit: "week" })).toMatchObject({
      value: { repeat: { unit: "week", every: 1 }, repeat_until: null },
    });
    expect(resolve({ ...base, repeat_unit: "month", repeat_every: 3, repeat_until: "2027-10-12" })).toMatchObject({
      value: { repeat: { unit: "month", every: 3 }, repeat_until: "2027-10-12" },
    });
    expect(resolve({ ...base, repeat_until: "2027-10-12" })).toMatchObject({ ok: false });
    expect(resolve({ ...base, repeat_unit: "day", repeat_until: "2026-10-11" })).toMatchObject({ ok: false });
  });

  it("the schema rejects malformed fields", () => {
    expect(createEventSchema.safeParse({ ...base, title: "  " }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, start_date: "12.10.2026" }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, start_time: "9:00" }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, calendar_id: "x" }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, repeat_unit: "hour" }).success).toBe(false);
  });

  it("eventFormValues is the inverse of resolveEventColumns", () => {
    const inputs: CreateEventInput[] = [
      base,
      { ...base, all_day: true, start_time: null, end_time: null, end_date: "2026-10-14" },
      { ...base, start_time: "22:00", end_date: "2026-10-13", end_time: "01:00" },
      { ...base, repeat_unit: "month", repeat_every: 3, repeat_until: "2027-10-12", notes: "aç karnına", location: "Klinik" },
    ];
    for (const input of inputs) {
      const first = resolve(input);
      if (!first.ok) throw new Error(first.error);
      const again = resolveEventColumns(eventFormValues(first.value));
      expect(again).toEqual(first);
    }
  });

  it("createCalendarSchema", () => {
    expect(createCalendarSchema.parse({ name: " Çiftlik " })).toEqual({ name: "Çiftlik", color: "blue" });
    expect(createCalendarSchema.safeParse({ name: "x", color: "neon" }).success).toBe(false);
  });

  it("the page query falls back instead of failing", () => {
    expect(calendarPageQuerySchema.parse({ gorunum: "hafta", tarih: "2026-10-11" })).toEqual({
      gorunum: "hafta",
      tarih: "2026-10-11",
    });
    expect(calendarPageQuerySchema.parse({ gorunum: "yil", tarih: "dün" })).toEqual({});
  });

  it("the range query is bounded", () => {
    expect(calendarRangeSchema.safeParse({ from: "2026-10-01", to: "2026-10-31" }).success).toBe(true);
    expect(calendarRangeSchema.safeParse({ from: "2026-10-01", to: "2026-09-30" }).success).toBe(false);
    expect(calendarRangeSchema.safeParse({ from: "2026-10-01", to: "2026-12-01" }).success).toBe(true);
    expect(calendarRangeSchema.safeParse({ from: "2026-10-01", to: "2026-12-02" }).success).toBe(false);
  });
});
