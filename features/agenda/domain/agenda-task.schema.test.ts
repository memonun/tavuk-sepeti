import { describe, expect, it } from "vitest";

import {
  agendaPageQuerySchema,
  createAgendaTaskSchema,
  setAgendaTaskCompletedSchema,
  updateAgendaTaskSchema,
} from "@/features/agenda/domain/agenda-task.schema";
import {
  AGENDA_CATEGORIES,
  describeRepeatRule,
} from "@/features/agenda/domain/agenda-task";

const ID = "4f1c2b9e-8a7d-4c3b-9e2f-1a2b3c4d5e6f";

describe("createAgendaTaskSchema", () => {
  it("accepts a minimal task and fills defaults", () => {
    const parsed = createAgendaTaskSchema.parse({ title: "  Kümes temizliği  " });
    expect(parsed).toEqual({
      title: "Kümes temizliği",
      notes: null,
      category: "genel",
      due_date: null,
      repeat_unit: null,
      repeat_every: null,
    });
  });

  it("maps an empty date and empty notes to null", () => {
    const parsed = createAgendaTaskSchema.parse({ title: "Yem al", due_date: "", notes: "   " });
    expect(parsed.due_date).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("accepts a recurring task with a start date", () => {
    const parsed = createAgendaTaskSchema.parse({
      title: "Parazit ilacı",
      category: "hayvan_sagligi",
      due_date: "2026-10-07",
      repeat_unit: "month",
      repeat_every: 3,
    });
    expect(parsed).toMatchObject({ repeat_unit: "month", repeat_every: 3, due_date: "2026-10-07" });
  });

  it("rejects an empty or too-long title", () => {
    expect(createAgendaTaskSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(createAgendaTaskSchema.safeParse({ title: "x".repeat(201) }).success).toBe(false);
  });

  it("rejects an unknown category and a malformed date", () => {
    expect(createAgendaTaskSchema.safeParse({ title: "a", category: "stok" }).success).toBe(false);
    expect(createAgendaTaskSchema.safeParse({ title: "a", due_date: "07.10.2026" }).success).toBe(false);
  });

  it("rejects a half-specified repeat rule", () => {
    const unitOnly = createAgendaTaskSchema.safeParse({
      title: "a",
      due_date: "2026-10-07",
      repeat_unit: "week",
    });
    expect(unitOnly.success).toBe(false);

    const everyOnly = createAgendaTaskSchema.safeParse({
      title: "a",
      due_date: "2026-10-07",
      repeat_every: 2,
    });
    expect(everyOnly.success).toBe(false);
  });

  it("rejects a recurring task without a date", () => {
    const result = createAgendaTaskSchema.safeParse({ title: "a", repeat_unit: "day", repeat_every: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["due_date"]);
    }
  });

  it("rejects an out-of-range interval", () => {
    const base = { title: "a", due_date: "2026-10-07", repeat_unit: "day" as const };
    expect(createAgendaTaskSchema.safeParse({ ...base, repeat_every: 0 }).success).toBe(false);
    expect(createAgendaTaskSchema.safeParse({ ...base, repeat_every: 366 }).success).toBe(false);
    expect(createAgendaTaskSchema.safeParse({ ...base, repeat_every: 1.5 }).success).toBe(false);
  });
});

describe("updateAgendaTaskSchema", () => {
  it("requires a uuid id and applies the same repeat rules", () => {
    expect(updateAgendaTaskSchema.safeParse({ title: "a" }).success).toBe(false);
    expect(updateAgendaTaskSchema.safeParse({ id: ID, title: "a" }).success).toBe(true);
    expect(
      updateAgendaTaskSchema.safeParse({ id: ID, title: "a", repeat_unit: "week", repeat_every: 1 }).success,
    ).toBe(false);
  });
});

describe("setAgendaTaskCompletedSchema", () => {
  it("needs an id and an explicit boolean", () => {
    expect(setAgendaTaskCompletedSchema.safeParse({ id: ID, completed: true }).success).toBe(true);
    expect(setAgendaTaskCompletedSchema.safeParse({ id: ID, completed: "true" }).success).toBe(false);
    expect(setAgendaTaskCompletedSchema.safeParse({ id: "x", completed: false }).success).toBe(false);
  });
});

describe("agendaPageQuerySchema", () => {
  it("passes valid params through", () => {
    expect(agendaPageQuerySchema.parse({ hafta: "2026-10-05", kategori: "hayvan_sagligi" })).toEqual({
      hafta: "2026-10-05",
      kategori: "hayvan_sagligi",
    });
  });

  it("falls back to defaults on garbage instead of failing", () => {
    expect(agendaPageQuerySchema.parse({ hafta: "dün", kategori: "yok" })).toEqual({
      hafta: undefined,
      kategori: undefined,
    });
    expect(agendaPageQuerySchema.parse({ hafta: ["2026-10-05", "2026-10-12"] })).toMatchObject({
      hafta: undefined,
    });
    expect(agendaPageQuerySchema.parse({})).toEqual({});
  });
});

describe("describeRepeatRule", () => {
  it("names every-one rules", () => {
    expect(describeRepeatRule({ unit: "day", every: 1 })).toBe("Her gün");
    expect(describeRepeatRule({ unit: "week", every: 1 })).toBe("Her hafta");
    expect(describeRepeatRule({ unit: "month", every: 1 })).toBe("Her ay");
  });

  it("uses the Turkish 'N <unit>de bir' form otherwise", () => {
    expect(describeRepeatRule({ unit: "day", every: 3 })).toBe("3 günde bir");
    expect(describeRepeatRule({ unit: "week", every: 2 })).toBe("2 haftada bir");
    expect(describeRepeatRule({ unit: "month", every: 3 })).toBe("3 ayda bir");
  });
});

describe("AGENDA_CATEGORIES", () => {
  it("matches the DB CHECK constraint list exactly", () => {
    // supabase/migrations/20261007130000_agenda_tasks.sql — agenda_tasks_category_check.
    expect(AGENDA_CATEGORIES).toEqual([
      "genel",
      "hayvan_sagligi",
      "kumes_bakimi",
      "satis_teslimat",
      "alisveris",
    ]);
  });
});
