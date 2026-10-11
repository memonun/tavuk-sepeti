/**
 * Persistence for calendar_events and their skipped occurrences. Reads take an
 * explicit time range and are capped (CLAUDE.md §9), with the true total
 * returned alongside so the page can say when it shows a partial range.
 */
import "server-only";

import { ExternalApiError, NotFoundError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { toIstanbulDateString } from "@/shared/utils/date";
import { isRepeatUnit } from "@/shared/utils/repeat-rule";

import type { CalendarEvent } from "@/features/calendar/domain/calendar";
import type { EventColumns } from "@/features/calendar/domain/calendar.schema";

const EVENT_SELECT =
  "id, calendar_id, title, notes, location, all_day, starts_at, ends_at, repeat_unit, repeat_every, repeat_until" as const;

/** Upper bound of one-off events in one visible range (at most a 6-week month
 *  grid). Far above a farm's month; it bounds a runaway import. */
export const EVENT_RANGE_LIMIT = 500;

/** Upper bound of repeating series considered for one range. */
export const REPEATING_EVENT_LIMIT = 200;

type EventRow = {
  id: string;
  calendar_id: string;
  title: string;
  notes: string | null;
  location: string | null;
  all_day: boolean;
  starts_at: string;
  ends_at: string;
  repeat_unit: string | null;
  repeat_every: number | null;
  repeat_until: string | null;
};

function rowToEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    calendar_id: row.calendar_id,
    title: row.title,
    notes: row.notes,
    location: row.location,
    all_day: row.all_day,
    // PostgREST returns "+00:00"; normalize to the "Z" form the domain produces.
    starts_at: new Date(row.starts_at).toISOString(),
    ends_at: new Date(row.ends_at).toISOString(),
    repeat:
      isRepeatUnit(row.repeat_unit) && row.repeat_every !== null
        ? { unit: row.repeat_unit, every: row.repeat_every }
        : null,
    repeat_until: row.repeat_until,
  };
}

export interface EventsInRange {
  /** One-off events overlapping the range plus every series that could. */
  events: CalendarEvent[];
  /** Skipped occurrence days per repeating event id. */
  skippedByEvent: Map<string, Set<string>>;
  /** True when either read hit its cap. */
  truncated: boolean;
}

/**
 * Everything needed to draw [from, to): the one-off events that overlap it,
 * the repeating series that have started before it ends (and have not ended
 * before it starts), and those series' skipped days. Three round trips at
 * most, never one per event.
 */
export async function listEventsForRange(
  from: Date,
  to: Date,
): Promise<Result<EventsInRange, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const [oneOff, repeating] = await Promise.all([
    supabase
      .from("calendar_events")
      .select(EVENT_SELECT, { count: "exact" })
      .is("repeat_unit", null)
      .lt("starts_at", toIso)
      .gt("ends_at", fromIso)
      .order("starts_at", { ascending: true })
      .range(0, EVENT_RANGE_LIMIT - 1),
    supabase
      .from("calendar_events")
      .select(EVENT_SELECT, { count: "exact" })
      .not("repeat_unit", "is", null)
      .lt("starts_at", toIso)
      // A series whose last day is before the range can no longer reach it.
      .or(`repeat_until.is.null,repeat_until.gte.${toIstanbulDateString(from)}`)
      .order("starts_at", { ascending: true })
      .range(0, REPEATING_EVENT_LIMIT - 1),
  ]);

  const failed = oneOff.error ?? repeating.error;
  if (failed) {
    logger.error({ code: failed.code, message: failed.message }, "list_events_for_range_failed");
    return err(new ExternalApiError({ message: "Etkinlikler yüklenemedi.", cause: failed }));
  }

  const oneOffRows = oneOff.data ?? [];
  const repeatingRows = repeating.data ?? [];

  const skippedByEvent = new Map<string, Set<string>>();
  if (repeatingRows.length > 0) {
    const { data: exceptions, error } = await supabase
      .from("calendar_event_exceptions")
      .select("event_id, occurrence_date")
      .in(
        "event_id",
        repeatingRows.map((row) => row.id),
      )
      // An occurrence that overlaps the range may have started before it, but
      // never more than a (capped, ≤ 1 year) event length earlier.
      .lt("occurrence_date", toIstanbulDateString(to))
      .range(0, 9_999);
    if (error) {
      logger.error({ code: error.code, message: error.message }, "list_event_exceptions_failed");
      return err(new ExternalApiError({ message: "Etkinlikler yüklenemedi.", cause: error }));
    }
    for (const exception of exceptions ?? []) {
      const days = skippedByEvent.get(exception.event_id);
      if (days) days.add(exception.occurrence_date);
      else skippedByEvent.set(exception.event_id, new Set([exception.occurrence_date]));
    }
  }

  return ok({
    events: [...oneOffRows, ...repeatingRows].map(rowToEvent),
    skippedByEvent,
    truncated:
      (oneOff.count ?? 0) > oneOffRows.length || (repeating.count ?? 0) > repeatingRows.length,
  });
}

export async function findEventById(
  id: string,
): Promise<Result<CalendarEvent, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .select(EVENT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logger.error({ code: error.code, message: error.message }, "find_calendar_event_failed");
    return err(new ExternalApiError({ message: "Etkinlik yüklenemedi.", cause: error }));
  }
  if (!data) return err(new NotFoundError({ message: "Etkinlik bulunamadı." }));
  return ok(rowToEvent(data));
}

function toRow(columns: EventColumns) {
  return {
    calendar_id: columns.calendar_id,
    title: columns.title,
    notes: columns.notes,
    location: columns.location,
    all_day: columns.all_day,
    starts_at: columns.starts_at,
    ends_at: columns.ends_at,
    repeat_unit: columns.repeat?.unit ?? null,
    repeat_every: columns.repeat?.every ?? null,
    repeat_until: columns.repeat_until,
  };
}

/** A missing calendar surfaces as a foreign-key violation (23503). */
const FK_VIOLATION = "23503";

export async function createEvent(
  columns: EventColumns,
  createdBy: string,
): Promise<Result<string, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .insert({ ...toRow(columns), created_by: createdBy })
    .select("id")
    .single();

  if (error) {
    if (error.code === FK_VIOLATION) return err(new NotFoundError({ message: "Takvim bulunamadı." }));
    logger.error({ code: error.code, message: error.message }, "create_calendar_event_failed");
    return err(new ExternalApiError({ message: "Etkinlik eklenemedi.", cause: error }));
  }
  return ok(data.id);
}

export async function updateEvent(
  id: string,
  columns: EventColumns,
): Promise<Result<void, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("calendar_events")
    .update(toRow(columns))
    .eq("id", id)
    .select("id");

  if (error) {
    if (error.code === FK_VIOLATION) return err(new NotFoundError({ message: "Takvim bulunamadı." }));
    logger.error({ code: error.code, message: error.message }, "update_calendar_event_failed");
    return err(new ExternalApiError({ message: "Etkinlik güncellenemedi.", cause: error }));
  }
  if ((data ?? []).length === 0) return err(new NotFoundError({ message: "Etkinlik bulunamadı." }));
  return ok(undefined);
}

/** Deletes the event — for a repeating one, the whole series (its skipped
 *  days go with it through ON DELETE CASCADE). */
export async function deleteEvent(
  id: string,
): Promise<Result<void, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("calendar_events").delete().eq("id", id).select("id");
  if (error) {
    logger.error({ code: error.code, message: error.message }, "delete_calendar_event_failed");
    return err(new ExternalApiError({ message: "Etkinlik silinemedi.", cause: error }));
  }
  if ((data ?? []).length === 0) return err(new NotFoundError({ message: "Etkinlik bulunamadı." }));
  return ok(undefined);
}

/**
 * Skips one occurrence of a repeating event. Idempotent: the (event_id,
 * occurrence_date) primary key turns a double tap into a no-op.
 */
export async function insertEventException(
  eventId: string,
  occurrenceDate: string,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("calendar_event_exceptions")
    .upsert(
      { event_id: eventId, occurrence_date: occurrenceDate },
      { onConflict: "event_id,occurrence_date", ignoreDuplicates: true },
    );
  if (error) {
    logger.error({ code: error.code, message: error.message }, "insert_event_exception_failed");
    return err(new ExternalApiError({ message: "Etkinlik silinemedi.", cause: error }));
  }
  return ok(undefined);
}
