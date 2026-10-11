/**
 * Reminder Zod schemas — single source of truth for the Anımsatıcılar forms
 * (UI), the Server Actions (application) and the MCP connector's write tools.
 * They mirror the DB constraints in
 * supabase/migrations/20261010221830_takvim_ve_animsaticilar.sql so a bad
 * payload fails here with a Turkish message instead of as a Postgres check
 * violation.
 *
 * Updates are PATCHES: a key that is absent keeps its stored value, `null`
 * (or an empty string from a cleared input) clears it. The rules that span
 * several fields — a time needs a day, a repeat rule needs a day — can only
 * be judged on the merged result, so they live in applyReminderPatch.
 */
import { z } from "zod";

import { dueParts, type DueParts } from "@/features/reminders/domain/due";
import {
  isSmartListId,
  type Reminder,
  type ReminderPriority,
  type ReminderView,
} from "@/features/reminders/domain/reminder";
import { ACCENT_COLORS } from "@/shared/palette/accent-colors";
import { err, ok, type Result } from "@/shared/result";
import { REPEAT_UNITS, type RepeatRule } from "@/shared/utils/repeat-rule";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const ymdSchema = z
  .string()
  .regex(YMD_RE, "Geçerli bir tarih girin.")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Geçerli bir tarih girin.");

const hhmmSchema = z.string().regex(HHMM_RE, "Geçerli bir saat girin.");

const uuidSchema = z.string().uuid("Geçersiz kayıt.");

// ---- Lists ------------------------------------------------------------------

const listNameSchema = z
  .string()
  .trim()
  .min(1, "Liste adı gerekli.")
  .max(60, "Liste adı en fazla 60 karakter olabilir.");

const colorSchema = z.enum(ACCENT_COLORS, { message: "Geçersiz renk." });

export const createReminderListSchema = z.object({
  name: listNameSchema,
  color: colorSchema.default("blue"),
});
export type CreateReminderListInput = z.input<typeof createReminderListSchema>;

export const updateReminderListSchema = z.object({
  id: uuidSchema,
  name: listNameSchema.optional(),
  color: colorSchema.optional(),
});
export type UpdateReminderListInput = z.input<typeof updateReminderListSchema>;

export const deleteReminderListSchema = z.object({ id: uuidSchema });

// ---- Reminders --------------------------------------------------------------

const titleSchema = z
  .string()
  .trim()
  .min(1, "Başlık gerekli.")
  .max(200, "Başlık en fazla 200 karakter olabilir.");

const notesSchema = z
  .string()
  .trim()
  .max(2000, "Not en fazla 2000 karakter olabilir.")
  .nullable()
  .transform((v) => (v === null || v.length === 0 ? null : v));

/** Empty string (a cleared date/time input) means "none". */
const dueDateSchema = z
  .union([ymdSchema, z.literal("")])
  .nullable()
  .transform((v) => (v ? v : null));
const dueTimeSchema = z
  .union([hhmmSchema, z.literal("")])
  .nullable()
  .transform((v) => (v ? v : null));

const prioritySchema = z.coerce
  .number()
  .int("Geçersiz öncelik.")
  .min(0, "Geçersiz öncelik.")
  .max(3, "Geçersiz öncelik.")
  .transform((v) => v as ReminderPriority);

const repeatUnitSchema = z.enum(REPEAT_UNITS, { message: "Geçersiz tekrar." }).nullable();
const repeatEverySchema = z.coerce
  .number()
  .int("Tekrar aralığı tam sayı olmalı.")
  .min(1, "Tekrar aralığı en az 1 olmalı.")
  .max(365, "Tekrar aralığı en fazla 365 olabilir.")
  .nullable();

const reminderPatchShape = {
  notes: notesSchema.optional(),
  due_date: dueDateSchema.optional(),
  due_time: dueTimeSchema.optional(),
  priority: prioritySchema.optional(),
  flagged: z.boolean().optional(),
  repeat_unit: repeatUnitSchema.optional(),
  repeat_every: repeatEverySchema.optional(),
};

export const createReminderSchema = z.object({
  list_id: uuidSchema,
  title: titleSchema,
  ...reminderPatchShape,
});
export type CreateReminderInput = z.input<typeof createReminderSchema>;

export const updateReminderSchema = z.object({
  id: uuidSchema,
  list_id: uuidSchema.optional(),
  title: titleSchema.optional(),
  ...reminderPatchShape,
});
export type UpdateReminderInput = z.input<typeof updateReminderSchema>;

export const setReminderCompletedSchema = z.object({
  id: uuidSchema,
  completed: z.boolean(),
});
export type SetReminderCompletedInput = z.input<typeof setReminderCompletedSchema>;

export const deleteReminderSchema = z.object({ id: uuidSchema });

/** Everything a reminder's form edits, in the form's own terms. */
export interface ReminderFields {
  readonly list_id: string;
  readonly title: string;
  readonly notes: string | null;
  readonly due: DueParts;
  readonly priority: ReminderPriority;
  readonly flagged: boolean;
  readonly repeat: RepeatRule | null;
}

export type ReminderPatch = Omit<z.output<typeof updateReminderSchema>, "id">;

/** What a brand-new reminder starts from before its own input is applied. */
export function blankReminderFields(listId: string, title: string): ReminderFields {
  return {
    list_id: listId,
    title,
    notes: null,
    due: { date: null, time: null },
    priority: 0,
    flagged: false,
    repeat: null,
  };
}

/**
 * Applies a patch to a reminder's fields and checks the cross-field rules on
 * the result. Clearing the day clears the time with it, and clearing the
 * repeat unit clears the rule; asking for a time or a repeat WITHOUT a day
 * is an error rather than a silent drop.
 */
export function applyReminderPatch(
  base: ReminderFields,
  patch: ReminderPatch,
): Result<ReminderFields, string> {
  const date = patch.due_date !== undefined ? patch.due_date : base.due.date;
  let time = patch.due_time !== undefined ? patch.due_time : base.due.time;
  if (date === null) {
    if (patch.due_time !== undefined && patch.due_time !== null) {
      return err("Saat için önce bir tarih seçin.");
    }
    time = null;
  }

  let unit = patch.repeat_unit !== undefined ? patch.repeat_unit : (base.repeat?.unit ?? null);
  let every = patch.repeat_every !== undefined ? patch.repeat_every : (base.repeat?.every ?? null);
  if (patch.repeat_unit === null) every = null;
  if (unit !== null && every === null) every = 1;
  if (unit === null && every !== null) {
    if (patch.repeat_every !== undefined) return err("Tekrar sıklığı eksik.");
    every = null;
  }
  if (unit !== null && date === null) {
    // The day was cleared on a repeating reminder without touching the rule:
    // that reads as "no longer scheduled", so the rule goes with it.
    if (patch.repeat_unit === undefined && patch.repeat_every === undefined) {
      unit = null;
      every = null;
    } else {
      return err("Tekrarlayan anımsatıcı için bir tarih seçin.");
    }
  }

  return ok({
    list_id: patch.list_id ?? base.list_id,
    title: patch.title ?? base.title,
    notes: patch.notes !== undefined ? patch.notes : base.notes,
    due: { date, time },
    priority: patch.priority ?? base.priority,
    flagged: patch.flagged ?? base.flagged,
    repeat: unit !== null && every !== null ? { unit, every } : null,
  });
}

// ---- Page query -------------------------------------------------------------

/** /animsaticilar search params. Anything invalid falls back to the default
 *  rather than erroring — a mistyped bookmark should still open the page. */
export const remindersPageQuerySchema = z.object({
  /** A smart list id ("bugun", …) or a list's uuid. */
  liste: z.string().max(64).optional().catch(undefined),
  /** 1-based page of the "Tamamlanan" list. */
  sayfa: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolves the `liste` param against the lists that actually exist. An
 *  unknown or deleted list falls back to "Bugün". */
export function resolveReminderView(
  liste: string | undefined,
  listIds: readonly string[],
): ReminderView {
  if (isSmartListId(liste)) return { kind: "smart", id: liste };
  if (liste !== undefined && UUID_RE.test(liste) && listIds.includes(liste)) {
    return { kind: "list", id: liste };
  }
  return { kind: "smart", id: "bugun" };
}

/** A stored reminder in the form's terms — the base an update patch applies to. */
export function fieldsOfReminder(
  reminder: Pick<
    Reminder,
    "list_id" | "title" | "notes" | "due_at" | "due_all_day" | "priority" | "flagged" | "repeat"
  >,
): ReminderFields {
  return {
    list_id: reminder.list_id,
    title: reminder.title,
    notes: reminder.notes,
    due: dueParts(reminder),
    priority: reminder.priority,
    flagged: reminder.flagged,
    repeat: reminder.repeat,
  };
}
