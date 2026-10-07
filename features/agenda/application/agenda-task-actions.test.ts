/**
 * Completion is the agenda's only state transition (open ⇄ done), and for a
 * recurring task it also drives the series. What matters: the next
 * occurrence is created BEFORE the task is marked done (so a failure can
 * never end the series silently), a no-op request changes nothing, and
 * reopening never spawns.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExternalApiError } from "@/shared/errors/app-error";

import type { AgendaTask } from "@/features/agenda/domain/agenda-task";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const logAudit = vi.fn();
vi.mock("@/shared/audit/log-audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock("@/features/auth/application/assert-admin", () => ({
  assertAdmin: async () => ({ ok: true, value: { id: "admin-1", email: null } }),
}));
vi.mock("@/shared/utils/date", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/utils/date")>()),
  todayInIstanbul: () => "2026-10-07",
}));

const findAgendaTaskById = vi.fn();
const insertNextOccurrence = vi.fn();
const setAgendaTaskCompletedAt = vi.fn();
vi.mock("@/features/agenda/infrastructure/agenda-task.repository", () => ({
  findAgendaTaskById: (...a: unknown[]) => findAgendaTaskById(...a),
  insertNextOccurrence: (...a: unknown[]) => insertNextOccurrence(...a),
  setAgendaTaskCompletedAt: (...a: unknown[]) => setAgendaTaskCompletedAt(...a),
  createAgendaTask: vi.fn(),
  updateAgendaTask: vi.fn(),
  deleteAgendaTask: vi.fn(),
}));

const { setAgendaTaskCompletedAction } = await import(
  "@/features/agenda/application/agenda-task-actions"
);

const ID = "4f1c2b9e-8a7d-4c3b-9e2f-1a2b3c4d5e6f";

function task(over: Partial<AgendaTask>): AgendaTask {
  return {
    id: ID,
    title: "Kümes temizliği",
    notes: null,
    category: "kumes_bakimi",
    due_date: "2026-10-05",
    repeat: null,
    completed_at: null,
    recurrence_parent_id: null,
    created_by: "admin-1",
    created_at: new Date("2026-10-01T08:00:00Z"),
    updated_at: new Date("2026-10-01T08:00:00Z"),
    ...over,
  };
}

const order: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  insertNextOccurrence.mockImplementation(async () => {
    order.push("insert");
    return { ok: true, value: { inserted: true } };
  });
  setAgendaTaskCompletedAt.mockImplementation(async () => {
    order.push("mark");
    return { ok: true, value: undefined };
  });
});

describe("setAgendaTaskCompletedAction", () => {
  it("open → done for a one-off task: marks it, spawns nothing", async () => {
    findAgendaTaskById.mockResolvedValue({ ok: true, value: task({}) });

    const result = await setAgendaTaskCompletedAction({ id: ID, completed: true });

    expect(result).toEqual({ ok: true, value: { id: ID, next_due_date: null } });
    expect(insertNextOccurrence).not.toHaveBeenCalled();
    expect(setAgendaTaskCompletedAt).toHaveBeenCalledWith(ID, expect.any(Date));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "agenda_task.completed" }));
  });

  it("open → done for a recurring task: inserts the next occurrence first, then marks", async () => {
    const weekly = task({ repeat: { unit: "week", every: 1 } });
    findAgendaTaskById.mockResolvedValue({ ok: true, value: weekly });

    const result = await setAgendaTaskCompletedAction({ id: ID, completed: true });

    // Due Mon 5 Oct, done Wed 7 Oct → next Mon 12 Oct.
    expect(insertNextOccurrence).toHaveBeenCalledWith(weekly, "2026-10-12", "admin-1");
    expect(order).toEqual(["insert", "mark"]);
    expect(result).toEqual({ ok: true, value: { id: ID, next_due_date: "2026-10-12" } });
  });

  it("does not mark the task done when creating the next occurrence fails", async () => {
    findAgendaTaskById.mockResolvedValue({ ok: true, value: task({ repeat: { unit: "day", every: 1 } }) });
    insertNextOccurrence.mockResolvedValue({ ok: false, error: new ExternalApiError({ message: "boom" }) });

    const result = await setAgendaTaskCompletedAction({ id: ID, completed: true });

    expect(result.ok).toBe(false);
    expect(setAgendaTaskCompletedAt).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("re-completing after a reopen finds the next row already there and reports no new date", async () => {
    findAgendaTaskById.mockResolvedValue({ ok: true, value: task({ repeat: { unit: "week", every: 1 } }) });
    insertNextOccurrence.mockResolvedValue({ ok: true, value: { inserted: false } });

    const result = await setAgendaTaskCompletedAction({ id: ID, completed: true });

    expect(result).toEqual({ ok: true, value: { id: ID, next_due_date: null } });
    expect(setAgendaTaskCompletedAt).toHaveBeenCalledTimes(1);
  });

  it("done → open: clears completed_at and never spawns", async () => {
    findAgendaTaskById.mockResolvedValue({
      ok: true,
      value: task({ repeat: { unit: "week", every: 1 }, completed_at: new Date("2026-10-07T09:00:00Z") }),
    });

    const result = await setAgendaTaskCompletedAction({ id: ID, completed: false });

    expect(result.ok).toBe(true);
    expect(insertNextOccurrence).not.toHaveBeenCalled();
    expect(setAgendaTaskCompletedAt).toHaveBeenCalledWith(ID, null);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "agenda_task.reopened" }));
  });

  it("a request for the state the task is already in changes nothing", async () => {
    findAgendaTaskById.mockResolvedValue({
      ok: true,
      value: task({ repeat: { unit: "day", every: 1 }, completed_at: new Date("2026-10-07T09:00:00Z") }),
    });

    const result = await setAgendaTaskCompletedAction({ id: ID, completed: true });

    expect(result).toEqual({ ok: true, value: { id: ID, next_due_date: null } });
    expect(insertNextOccurrence).not.toHaveBeenCalled();
    expect(setAgendaTaskCompletedAt).not.toHaveBeenCalled();
  });

  it("rejects a malformed payload before touching the database", async () => {
    const result = await setAgendaTaskCompletedAction({ id: "not-a-uuid", completed: true });

    expect(result.ok).toBe(false);
    expect(findAgendaTaskById).not.toHaveBeenCalled();
  });
});
