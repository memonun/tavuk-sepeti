/**
 * Calendar Zod schemas — single source of truth for the Takvim forms (UI), the
 * Server Actions (application) and the MCP connector's write tools. They mirror
 * the DB constraints in
 * supabase/migrations/20261010221830_takvim_ve_animsaticilar.sql so a bad
 * payload fails here with a Turkish message instead of as a Postgres check
 * violation.
 *
 * An event is written in the form's terms (days and HH:mm times in Istanbul);
 * resolveEventTimes turns that into the stored instants and owns the rules
 * that span several fields.
 */
import { z } from "zod";

import {
  CALENDAR_VIEWS,
  type CalendarEvent,
  type CalendarView,
} from "@/features/calendar/domain/calendar";
import { ACCENT_COLORS } from "@/shared/palette/accent-colors";
import { err, ok, type Result } from "@/shared/result";
import {
  addDaysToYmd,
  formatHHmm,
  istanbulInstant,
  toIstanbulDateString,
  ymdDayDiff,
} from "@/shared/utils/date";
import { REPEAT_UNITS, type RepeatRule } from "@/shared/utils/repeat-rule";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const ymdSchema = z
  .string()
  .regex(YMD_RE, "Geçerli bir tarih girin.")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Geçerli bir tarih girin.");

const hhmmSchema = z.string().regex(HHMM_RE, "Geçerli bir saat girin.");

const uuidSchema = z.string().uuid("Geçersiz kayıt.");

/** Empty string (a cleared input) and undefined both mean "none". */
const optionalYmd = z
  .union([ymdSchema, z.literal("")])
  .nullish()
  .transform((v) => (v ? v : null));
const optionalHhmm = z
  .union([hhmmSchema, z.literal("")])
  .nullish()
  .transform((v) => (v ? v : null));

function optionalText(max: number, message: string) {
  return z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((v) => (v && v.length > 0 ? v : null));
}

// ---- Calendars --------------------------------------------------------------

const calendarNameSchema = z
  .string()
  .trim()
  .min(1, "Takvim adı gerekli.")
  .max(60, "Takvim adı en fazla 60 karakter olabilir.");

const colorSchema = z.enum(ACCENT_COLORS, { message: "Geçersiz renk." });

export const createCalendarSchema = z.object({
  name: calendarNameSchema,
  color: colorSchema.default("blue"),
});
export type CreateCalendarInput = z.input<typeof createCalendarSchema>;

export const updateCalendarSchema = z.object({
  id: uuidSchema,
  name: calendarNameSchema.optional(),
  color: colorSchema.optional(),
});
export type UpdateCalendarInput = z.input<typeof updateCalendarSchema>;

export const deleteCalendarSchema = z.object({ id: uuidSchema });

// ---- Events -----------------------------------------------------------------

const eventObjectSchema = z.object({
  calendar_id: uuidSchema,
  title: z
    .string()
    .trim()
    .min(1, "Başlık gerekli.")
    .max(200, "Başlık en fazla 200 karakter olabilir."),
  notes: optionalText(2000, "Not en fazla 2000 karakter olabilir."),
  location: optionalText(200, "Konum en fazla 200 karakter olabilir."),
  all_day: z.boolean().default(false),
  start_date: ymdSchema,
  start_time: optionalHhmm,
  /** Defaults to the start day. For all-day events this is the LAST day. */
  end_date: optionalYmd,
  end_time: optionalHhmm,
  repeat_unit: z
    .enum(REPEAT_UNITS, { message: "Geçersiz tekrar." })
    .nullish()
    .transform((v) => v ?? null),
  repeat_every: z.coerce
    .number()
    .int("Tekrar aralığı tam sayı olmalı.")
    .min(1, "Tekrar aralığı en az 1 olmalı.")
    .max(365, "Tekrar aralığı en fazla 365 olabilir.")
    .nullish()
    .transform((v) => v ?? null),
  /** Last day the event repeats on; empty = forever. */
  repeat_until: optionalYmd,
});

export const createEventSchema = eventObjectSchema;
export type CreateEventInput = z.input<typeof createEventSchema>;
export type EventFormValues = z.output<typeof createEventSchema>;

/** A full rewrite: every field is taken from the payload. */
export const updateEventSchema = eventObjectSchema.extend({ id: uuidSchema });
export type UpdateEventInput = z.input<typeof updateEventSchema>;

export const deleteEventSchema = z.object({ id: uuidSchema });

export const deleteEventOccurrenceSchema = z.object({
  id: uuidSchema,
  /** The Istanbul day the occurrence to skip starts on. */
  occurrence_date: ymdSchema,
});

/** What an event's form resolves to — the columns the repository writes. */
export interface EventColumns {
  readonly calendar_id: string;
  readonly title: string;
  readonly notes: string | null;
  readonly location: string | null;
  readonly all_day: boolean;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly repeat: RepeatRule | null;
  readonly repeat_until: string | null;
}

/** A new timed event with no end lasts this long. */
export const DEFAULT_EVENT_MINUTES = 60;

/** Longest single event: a guard against a mistyped year, not a product rule. */
const MAX_EVENT_DAYS = 366;

/**
 * Resolves the form's days and times into stored instants and checks the rules
 * that span fields: an end before its start, a timed event without a start
 * time, a repeat that ends before it begins.
 */
export function resolveEventColumns(values: EventFormValues): Result<EventColumns, string> {
  const endDate = values.end_date ?? values.start_date;
  if (endDate < values.start_date) return err("Bitiş, başlangıçtan önce olamaz.");
  if (ymdDayDiff(values.start_date, endDate) > MAX_EVENT_DAYS) {
    return err("Etkinlik en fazla bir yıl sürebilir.");
  }

  let startsAt: Date;
  let endsAt: Date;
  if (values.all_day) {
    startsAt = istanbulInstant(values.start_date);
    // Exclusive end: the midnight after the last day.
    endsAt = istanbulInstant(addDaysToYmd(endDate, 1));
  } else {
    if (values.start_time === null) return err("Başlangıç saati gerekli.");
    startsAt = istanbulInstant(values.start_date, values.start_time);
    endsAt =
      values.end_time === null
        ? new Date(startsAt.getTime() + DEFAULT_EVENT_MINUTES * 60_000)
        : istanbulInstant(endDate, values.end_time);
    if (endsAt <= startsAt) return err("Bitiş, başlangıçtan sonra olmalı.");
  }

  const unit = values.repeat_unit;
  if (unit === null && values.repeat_until !== null) {
    return err("Bitiş tarihi yalnızca tekrarlayan etkinlikte olur.");
  }
  if (unit !== null && values.repeat_until !== null && values.repeat_until < values.start_date) {
    return err("Tekrar bitişi, başlangıçtan önce olamaz.");
  }

  return ok({
    calendar_id: values.calendar_id,
    title: values.title,
    notes: values.notes,
    location: values.location,
    all_day: values.all_day,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    repeat: unit === null ? null : { unit, every: values.repeat_every ?? 1 },
    repeat_until: unit === null ? null : values.repeat_until,
  });
}

/** A stored event back in the form's terms — the inverse of resolveEventColumns. */
export function eventFormValues(
  event: Pick<
    CalendarEvent,
    | "calendar_id"
    | "title"
    | "notes"
    | "location"
    | "all_day"
    | "starts_at"
    | "ends_at"
    | "repeat"
    | "repeat_until"
  >,
): EventFormValues {
  const startDate = toIstanbulDateString(event.starts_at);
  return {
    calendar_id: event.calendar_id,
    title: event.title,
    notes: event.notes,
    location: event.location,
    all_day: event.all_day,
    start_date: startDate,
    start_time: event.all_day ? null : formatHHmm(event.starts_at),
    // All-day ends_at is the midnight AFTER the last day.
    end_date: event.all_day
      ? addDaysToYmd(toIstanbulDateString(event.ends_at), -1)
      : toIstanbulDateString(event.ends_at),
    end_time: event.all_day ? null : formatHHmm(event.ends_at),
    repeat_unit: event.repeat?.unit ?? null,
    repeat_every: event.repeat?.every ?? null,
    repeat_until: event.repeat_until,
  };
}

// ---- Page / range queries ---------------------------------------------------

/** /takvim search params. Anything invalid falls back to the default rather
 *  than erroring — a mistyped bookmark should still open the calendar. */
export const calendarPageQuerySchema = z.object({
  gorunum: z.enum(CALENDAR_VIEWS).optional().catch(undefined),
  /** The day to focus on; empty = today. */
  tarih: ymdSchema.optional().catch(undefined),
});
export type CalendarPageQuery = z.output<typeof calendarPageQuerySchema>;

export const DEFAULT_CALENDAR_VIEW: CalendarView = "ay";

/** Longest range one read may cover (a 6-week month grid is 42 days). */
export const MAX_RANGE_DAYS = 62;

/** An explicit day range, both ends inclusive — the MCP connector's read. */
export const calendarRangeSchema = z
  .object({ from: ymdSchema, to: ymdSchema })
  .superRefine((val, ctx) => {
    if (val.to < val.from) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "Bitiş, başlangıçtan önce olamaz." });
    } else if (ymdDayDiff(val.from, val.to) >= MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: `Aralık en fazla ${MAX_RANGE_DAYS} gün olabilir.`,
      });
    }
  });
