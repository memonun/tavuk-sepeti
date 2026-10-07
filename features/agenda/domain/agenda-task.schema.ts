/**
 * Agenda task Zod schemas — single source of truth for the Ajanda form (UI)
 * and the agenda Server Actions (application). Mirrors the DB constraints in
 * supabase/migrations/20261007130000_agenda_tasks.sql so a bad payload fails
 * here with a Turkish message instead of as a Postgres check violation.
 */
import { z } from "zod";

import type { AgendaCategory, RepeatUnit } from "@/features/agenda/domain/agenda-task";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const ymdSchema = z
  .string()
  .regex(YMD_RE, "Geçerli bir tarih girin.")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Geçerli bir tarih girin.");

export const agendaCategorySchema = z.enum([
  "genel",
  "hayvan_sagligi",
  "kumes_bakimi",
  "satis_teslimat",
  "alisveris",
]);

export const repeatUnitSchema = z.enum(["day", "week", "month"]);

/** Base object (no refinements) so the update schema can still `.extend()`
 *  it — `.superRefine()` returns a ZodEffects, which has no `.extend()`. */
const agendaTaskObjectSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "İş adı gerekli.")
    .max(200, "İş adı en fazla 200 karakter olabilir."),
  notes: z
    .string()
    .trim()
    .max(1000, "Not en fazla 1000 karakter olabilir.")
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null)),
  category: agendaCategorySchema.default("genel"),
  /** Empty string (a cleared date input) means "no date". */
  due_date: z
    .union([ymdSchema, z.literal("")])
    .nullish()
    .transform((v) => (v ? v : null)),
  repeat_unit: repeatUnitSchema.nullish().transform((v) => v ?? null),
  repeat_every: z.coerce
    .number()
    .int("Tekrar aralığı tam sayı olmalı.")
    .min(1, "Tekrar aralığı en az 1 olmalı.")
    .max(365, "Tekrar aralığı en fazla 365 olabilir.")
    .nullish()
    .transform((v) => v ?? null),
});

function requireConsistentRepeat(
  val: { due_date: string | null; repeat_unit: RepeatUnit | null; repeat_every: number | null },
  ctx: z.RefinementCtx,
) {
  if ((val.repeat_unit === null) !== (val.repeat_every === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: val.repeat_unit === null ? ["repeat_unit"] : ["repeat_every"],
      message: "Tekrar sıklığı eksik.",
    });
  }
  if (val.repeat_unit !== null && val.due_date === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["due_date"],
      message: "Tekrarlayan iş için bir başlangıç tarihi seçin.",
    });
  }
}

export const createAgendaTaskSchema = agendaTaskObjectSchema.superRefine(requireConsistentRepeat);
export type CreateAgendaTaskInput = z.input<typeof createAgendaTaskSchema>;
export type AgendaTaskInput = z.output<typeof createAgendaTaskSchema>;

export const updateAgendaTaskSchema = agendaTaskObjectSchema
  .extend({ id: z.string().uuid() })
  .superRefine(requireConsistentRepeat);
export type UpdateAgendaTaskInput = z.input<typeof updateAgendaTaskSchema>;

export const setAgendaTaskCompletedSchema = z.object({
  id: z.string().uuid(),
  completed: z.boolean(),
});
export type SetAgendaTaskCompletedInput = z.input<typeof setAgendaTaskCompletedSchema>;

export const deleteAgendaTaskSchema = z.object({ id: z.string().uuid() });
export type DeleteAgendaTaskInput = z.input<typeof deleteAgendaTaskSchema>;

/** /ajanda search params. Anything invalid falls back to the default rather
 *  than erroring — a mistyped bookmark should still open the current week. */
export const agendaPageQuerySchema = z.object({
  /** Any day inside the week to show; normalized to its Monday downstream. */
  hafta: ymdSchema.optional().catch(undefined),
  kategori: agendaCategorySchema.optional().catch(undefined),
});
export type AgendaPageQuery = z.output<typeof agendaPageQuerySchema>;

export type { AgendaCategory, RepeatUnit };
