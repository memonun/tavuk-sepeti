import { describe, expect, it } from "vitest";

import { dueDay, dueFromParts, dueParts, isOverdue } from "@/features/reminders/domain/due";
import { nextReminderDue } from "@/features/reminders/domain/recurrence";
import {
  applyReminderPatch,
  blankReminderFields,
  createReminderListSchema,
  createReminderSchema,
  remindersPageQuerySchema,
  resolveReminderView,
  updateReminderSchema,
  type ReminderFields,
} from "@/features/reminders/domain/reminder.schema";
import {
  compareByDue,
  groupByDueDay,
  groupByList,
} from "@/features/reminders/domain/reminder-views";
import { priorityMarks, type Reminder } from "@/features/reminders/domain/reminder";
import { istanbulInstant } from "@/shared/utils/date";

const LIST_A = "11111111-1111-4111-8111-111111111111";
const LIST_B = "22222222-2222-4222-8222-222222222222";

function reminder(overrides: Partial<Reminder> & { id: string }): Reminder {
  return {
    list_id: LIST_A,
    title: overrides.id,
    notes: null,
    due_at: null,
    due_all_day: true,
    priority: 0,
    flagged: false,
    repeat: null,
    completed_at: null,
    recurrence_parent_id: null,
    created_at: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

describe("due", () => {
  it("an all-day reminder stores its day's Istanbul midnight", () => {
    expect(dueFromParts({ date: "2026-10-11", time: null })).toEqual({
      due_at: "2026-10-10T21:00:00.000Z",
      due_all_day: true,
    });
  });

  it("a timed reminder stores the exact instant", () => {
    expect(dueFromParts({ date: "2026-10-11", time: "14:30" })).toEqual({
      due_at: "2026-10-11T11:30:00.000Z",
      due_all_day: false,
    });
  });

  it("no date stores nothing", () => {
    expect(dueFromParts({ date: null, time: null })).toEqual({ due_at: null, due_all_day: true });
  });

  it("round-trips through the stored shape", () => {
    for (const parts of [
      { date: null, time: null },
      { date: "2026-10-11", time: null },
      { date: "2026-10-11", time: "00:00" },
      { date: "2026-12-31", time: "23:59" },
    ]) {
      expect(dueParts(dueFromParts(parts))).toEqual(parts);
    }
  });

  it("dueDay reads the Istanbul day, not the UTC one", () => {
    // 00:30 Istanbul on the 11th is still the 10th in UTC.
    expect(dueDay({ due_at: istanbulInstant("2026-10-11", "00:30").toISOString() })).toBe("2026-10-11");
    expect(dueDay({ due_at: null })).toBeNull();
  });

  describe("isOverdue", () => {
    const now = istanbulInstant("2026-10-11", "12:00");

    it("an all-day reminder is not overdue during its own day", () => {
      const today = dueFromParts({ date: "2026-10-11", time: null });
      expect(isOverdue({ ...today, completed_at: null }, now)).toBe(false);
    });

    it("an all-day reminder is overdue once its day has passed", () => {
      const yesterday = dueFromParts({ date: "2026-10-10", time: null });
      expect(isOverdue({ ...yesterday, completed_at: null }, now)).toBe(true);
    });

    it("a timed reminder is overdue the moment its time has passed", () => {
      const earlier = dueFromParts({ date: "2026-10-11", time: "11:59" });
      const later = dueFromParts({ date: "2026-10-11", time: "12:01" });
      expect(isOverdue({ ...earlier, completed_at: null }, now)).toBe(true);
      expect(isOverdue({ ...later, completed_at: null }, now)).toBe(false);
    });

    it("completed or undated reminders are never overdue", () => {
      const yesterday = dueFromParts({ date: "2026-10-10", time: null });
      expect(isOverdue({ ...yesterday, completed_at: "2026-10-11T00:00:00.000Z" }, now)).toBe(false);
      expect(isOverdue({ due_at: null, due_all_day: true, completed_at: null }, now)).toBe(false);
    });
  });
});

describe("nextReminderDue", () => {
  const weekly = { unit: "week", every: 1 } as const;
  const daily = { unit: "day", every: 1 } as const;

  it("an all-day reminder done on its day moves one step on", () => {
    const due = dueFromParts({ date: "2026-10-05", time: null });
    const next = nextReminderDue(
      { due_at: due.due_at as string, due_all_day: true },
      weekly,
      istanbulInstant("2026-10-05", "10:00"),
    );
    expect(dueParts(next)).toEqual({ date: "2026-10-12", time: null });
  });

  it("done late skips the missed slots and keeps the weekday", () => {
    const due = dueFromParts({ date: "2026-09-07", time: null });
    const next = nextReminderDue(
      { due_at: due.due_at as string, due_all_day: true },
      weekly,
      istanbulInstant("2026-10-07", "10:00"),
    );
    expect(dueParts(next)).toEqual({ date: "2026-10-12", time: null });
  });

  it("done early still moves past its own date", () => {
    const due = dueFromParts({ date: "2026-10-12", time: null });
    const next = nextReminderDue(
      { due_at: due.due_at as string, due_all_day: true },
      weekly,
      istanbulInstant("2026-10-08", "10:00"),
    );
    expect(dueParts(next)).toEqual({ date: "2026-10-19", time: null });
  });

  it("keeps the time of day", () => {
    const due = dueFromParts({ date: "2026-10-05", time: "18:00" });
    const next = nextReminderDue(
      { due_at: due.due_at as string, due_all_day: false },
      weekly,
      istanbulInstant("2026-10-05", "18:30"),
    );
    expect(dueParts(next)).toEqual({ date: "2026-10-12", time: "18:00" });
  });

  it("a timed daily reminder ticked off late comes back today if its time is still ahead", () => {
    const due = dueFromParts({ date: "2026-10-10", time: "18:00" });
    const next = nextReminderDue(
      { due_at: due.due_at as string, due_all_day: false },
      daily,
      istanbulInstant("2026-10-11", "09:00"),
    );
    expect(dueParts(next)).toEqual({ date: "2026-10-11", time: "18:00" });
  });

  it("…and tomorrow once today's time has passed", () => {
    const due = dueFromParts({ date: "2026-10-10", time: "18:00" });
    const next = nextReminderDue(
      { due_at: due.due_at as string, due_all_day: false },
      daily,
      istanbulInstant("2026-10-11", "18:00"),
    );
    expect(dueParts(next)).toEqual({ date: "2026-10-12", time: "18:00" });
  });

  it("an all-day daily reminder never comes back for today", () => {
    const due = dueFromParts({ date: "2026-10-10", time: null });
    const next = nextReminderDue(
      { due_at: due.due_at as string, due_all_day: true },
      daily,
      istanbulInstant("2026-10-11", "09:00"),
    );
    expect(dueParts(next)).toEqual({ date: "2026-10-12", time: null });
  });

  it("monthly on the 31st clamps to a short month", () => {
    const due = dueFromParts({ date: "2026-01-31", time: null });
    const next = nextReminderDue(
      { due_at: due.due_at as string, due_all_day: true },
      { unit: "month", every: 1 },
      istanbulInstant("2026-01-31", "10:00"),
    );
    expect(dueParts(next)).toEqual({ date: "2026-02-28", time: null });
  });
});

describe("schemas", () => {
  it("createReminderSchema trims the title and normalizes empty inputs to null", () => {
    const parsed = createReminderSchema.parse({
      list_id: LIST_A,
      title: "  Aşı takvimi  ",
      notes: "   ",
      due_date: "",
      due_time: "",
    });
    expect(parsed.title).toBe("Aşı takvimi");
    expect(parsed.notes).toBeNull();
    expect(parsed.due_date).toBeNull();
    expect(parsed.due_time).toBeNull();
    expect(parsed.priority).toBeUndefined();
  });

  it("rejects an empty title, a bad date, a bad time and an out-of-range priority", () => {
    const base = { list_id: LIST_A, title: "x" };
    expect(createReminderSchema.safeParse({ ...base, title: "   " }).success).toBe(false);
    expect(createReminderSchema.safeParse({ ...base, due_date: "11.10.2026" }).success).toBe(false);
    expect(createReminderSchema.safeParse({ ...base, due_date: "2026-13-45" }).success).toBe(false);
    expect(createReminderSchema.safeParse({ ...base, due_time: "25:00" }).success).toBe(false);
    expect(createReminderSchema.safeParse({ ...base, priority: 4 }).success).toBe(false);
    expect(createReminderSchema.safeParse({ ...base, repeat_every: 0 }).success).toBe(false);
    expect(createReminderSchema.safeParse({ ...base, list_id: "nope" }).success).toBe(false);
  });

  it("updateReminderSchema keeps absent keys absent", () => {
    const parsed = updateReminderSchema.parse({ id: LIST_A, flagged: true });
    expect(parsed).toEqual({ id: LIST_A, flagged: true });
  });

  it("createReminderListSchema defaults the color and validates it", () => {
    expect(createReminderListSchema.parse({ name: " Yem " })).toEqual({ name: "Yem", color: "blue" });
    expect(createReminderListSchema.safeParse({ name: "Yem", color: "neon" }).success).toBe(false);
    expect(createReminderListSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("the page query falls back instead of failing", () => {
    expect(remindersPageQuerySchema.parse({ liste: "bugun", sayfa: "3" })).toEqual({
      liste: "bugun",
      sayfa: 3,
    });
    expect(remindersPageQuerySchema.parse({ sayfa: "abc" })).toEqual({});
  });

  it("resolveReminderView accepts smart lists and existing lists only", () => {
    expect(resolveReminderView("planlanan", [LIST_A])).toEqual({ kind: "smart", id: "planlanan" });
    expect(resolveReminderView(LIST_A, [LIST_A])).toEqual({ kind: "list", id: LIST_A });
    expect(resolveReminderView(LIST_B, [LIST_A])).toEqual({ kind: "smart", id: "bugun" });
    expect(resolveReminderView("'; drop table", [LIST_A])).toEqual({ kind: "smart", id: "bugun" });
    expect(resolveReminderView(undefined, [])).toEqual({ kind: "smart", id: "bugun" });
  });
});

describe("applyReminderPatch", () => {
  const base: ReminderFields = {
    ...blankReminderFields(LIST_A, "Kümes temizliği"),
    due: { date: "2026-10-12", time: "09:00" },
    repeat: { unit: "week", every: 1 },
  };

  function apply(patch: Parameters<typeof applyReminderPatch>[1], from: ReminderFields = base) {
    return applyReminderPatch(from, patch);
  }

  it("an empty patch changes nothing", () => {
    expect(apply({})).toEqual({ ok: true, value: base });
  });

  it("changes only the keys it carries", () => {
    const result = apply({ flagged: true, priority: 3, list_id: LIST_B });
    expect(result).toEqual({
      ok: true,
      value: { ...base, flagged: true, priority: 3, list_id: LIST_B },
    });
  });

  it("null clears notes; absent keeps them", () => {
    const withNotes = { ...base, notes: "eldiven al" };
    expect(apply({}, withNotes)).toMatchObject({ value: { notes: "eldiven al" } });
    expect(apply({ notes: null }, withNotes)).toMatchObject({ value: { notes: null } });
  });

  it("clearing the day clears the time and the repeat rule with it", () => {
    expect(apply({ due_date: null })).toMatchObject({
      ok: true,
      value: { due: { date: null, time: null }, repeat: null },
    });
  });

  it("clearing only the time makes it all-day", () => {
    expect(apply({ due_time: null })).toMatchObject({
      value: { due: { date: "2026-10-12", time: null } },
    });
  });

  it("a time without a day is an error, not a silent drop", () => {
    const undated = blankReminderFields(LIST_A, "x");
    expect(apply({ due_time: "10:00" }, undated)).toEqual({
      ok: false,
      error: "Saat için önce bir tarih seçin.",
    });
  });

  it("a repeat rule without a day is an error", () => {
    const undated = blankReminderFields(LIST_A, "x");
    expect(apply({ repeat_unit: "day" }, undated)).toEqual({
      ok: false,
      error: "Tekrarlayan anımsatıcı için bir tarih seçin.",
    });
    expect(apply({ due_date: null, repeat_unit: "day" })).toMatchObject({ ok: false });
  });

  it("a repeat unit alone defaults to every 1", () => {
    const oneOff = { ...base, repeat: null };
    expect(apply({ repeat_unit: "month" }, oneOff)).toMatchObject({
      value: { repeat: { unit: "month", every: 1 } },
    });
  });

  it("an interval alone is an error when there is no unit to apply it to", () => {
    const oneOff = { ...base, repeat: null };
    expect(apply({ repeat_every: 3 }, oneOff)).toEqual({ ok: false, error: "Tekrar sıklığı eksik." });
    // …but updates the interval of an existing rule.
    expect(apply({ repeat_every: 3 })).toMatchObject({ value: { repeat: { unit: "week", every: 3 } } });
  });

  it("clearing the unit clears the whole rule", () => {
    expect(apply({ repeat_unit: null })).toMatchObject({ value: { repeat: null } });
    expect(apply({ repeat_unit: null, repeat_every: 2 })).toMatchObject({ value: { repeat: null } });
  });
});

describe("views", () => {
  const at = (date: string, time: string | null) => dueFromParts({ date, time });

  it("compareByDue: dated before undated, all-day before timed, then insertion order", () => {
    const items = [
      reminder({ id: "undated" }),
      reminder({ id: "timed", ...at("2026-10-11", "00:00") }),
      reminder({ id: "allday", ...at("2026-10-11", null) }),
      reminder({ id: "earlier", ...at("2026-10-10", "23:00") }),
      reminder({ id: "undated-older", created_at: "2026-09-01T00:00:00.000Z" }),
    ];
    expect([...items].sort(compareByDue).map((r) => r.id)).toEqual([
      "earlier",
      "allday",
      "timed",
      "undated-older",
      "undated",
    ]);
  });

  it("groupByDueDay buckets by Istanbul day and drops undated reminders", () => {
    const groups = groupByDueDay([
      reminder({ id: "b", ...at("2026-10-12", "09:00") }),
      reminder({ id: "undated" }),
      reminder({ id: "a", ...at("2026-10-11", "00:30") }),
      reminder({ id: "c", ...at("2026-10-12", null) }),
    ]);
    expect(groups.map((g) => [g.day, g.reminders.map((r) => r.id)])).toEqual([
      ["2026-10-11", ["a"]],
      ["2026-10-12", ["c", "b"]],
    ]);
  });

  it("groupByList keeps the lists' order and their empty sections", () => {
    const groups = groupByList(
      [LIST_B, LIST_A],
      [reminder({ id: "a1" }), reminder({ id: "a2" }), reminder({ id: "orphan", list_id: "x" })],
    );
    expect(groups.map((g) => [g.listId, g.reminders.map((r) => r.id)])).toEqual([
      [LIST_B, []],
      [LIST_A, ["a1", "a2"]],
    ]);
  });

  it("priorityMarks", () => {
    expect(priorityMarks(0)).toBe("");
    expect(priorityMarks(3)).toBe("!!!");
  });
});
