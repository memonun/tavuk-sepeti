/**
 * Zod schemas for the planner feature — single source of truth for both
 * the UI (quick-add input, edit form) and the Server Actions.
 */
import { z } from "zod";

const titleSchema = z
  .string()
  .trim()
  .min(1, "Başlık gerekli.")
  .max(200, "Başlık 200 karakteri geçemez.");

/** Blank string → null, so a cleared textarea actually clears the column
 *  instead of persisting an empty string. */
const blankToNull = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? null : value;

const notesSchema = z.preprocess(
  blankToNull,
  z.string().trim().max(2000, "Not 2000 karakteri geçemez.").nullable(),
);

const scheduledDateSchema = z.preprocess(
  blankToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih.")
    .nullable(),
);

export const plannerTaskStatusSchema = z.enum(["open", "done"]);

/** Payload accepted by the create-planner-task Server Action. Omitted
 *  notes/scheduled_date resolve to null — a new task always has a
 *  concrete (possibly empty) value for both, never "untouched". */
export const createPlannerTaskSchema = z.object({
  title: titleSchema,
  notes: notesSchema.default(null),
  scheduled_date: scheduledDateSchema.default(null),
});
export type CreatePlannerTaskInput = z.output<typeof createPlannerTaskSchema>;

/**
 * Payload accepted by the update-planner-task Server Action. Every field
 * but `id` is `.optional()` — an OMITTED key leaves that column untouched
 * (the repository only patches keys present in the parsed object), while
 * an explicit blank string on notes/scheduled_date clears it to null.
 */
export const updatePlannerTaskSchema = z.object({
  id: z.string().uuid(),
  title: titleSchema.optional(),
  notes: notesSchema.optional(),
  scheduled_date: scheduledDateSchema.optional(),
  status: plannerTaskStatusSchema.optional(),
});
export type UpdatePlannerTaskInput = z.output<typeof updatePlannerTaskSchema>;
