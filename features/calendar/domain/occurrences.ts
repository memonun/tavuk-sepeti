/**
 * Turns stored events into the occurrences a visible range shows. Pure.
 *
 * A one-off event is its own single occurrence. A repeating event's k-th
 * occurrence starts on `anchor day + k steps` (shared/utils/repeat-rule.ts) at
 * the series' own time of day and lasts as long as the first one. Istanbul has
 * no DST, so "same wall-clock time, same duration" is plain millisecond math.
 */
import {
  addDaysToYmd,
  formatHHmm,
  istanbulInstant,
  toIstanbulDateString,
} from "@/shared/utils/date";
import { firstOccurrenceIndexOnOrAfter, occurrenceYmd } from "@/shared/utils/repeat-rule";

import type { CalendarEvent, EventOccurrence } from "@/features/calendar/domain/calendar";

/** No visible range holds more occurrences of one series than this (a daily
 *  event over a 6-week grid is 42); it only bounds a malformed input. */
const MAX_OCCURRENCES_PER_EVENT = 400;

function occurrenceOf(
  event: CalendarEvent,
  startsAt: Date,
  endsAt: Date,
  occurrenceDate: string,
): EventOccurrence {
  return {
    key: `${event.id}:${occurrenceDate}`,
    event_id: event.id,
    calendar_id: event.calendar_id,
    title: event.title,
    notes: event.notes,
    location: event.location,
    all_day: event.all_day,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    occurrence_date: occurrenceDate,
    repeat: event.repeat,
    repeat_until: event.repeat_until,
    series_starts_at: event.starts_at,
    series_ends_at: event.ends_at,
  };
}

/**
 * The occurrences of `event` that overlap [rangeStart, rangeEnd).
 * `skipped` holds the Istanbul start days deleted from the series.
 */
export function expandEvent(
  event: CalendarEvent,
  skipped: ReadonlySet<string>,
  rangeStart: Date,
  rangeEnd: Date,
): EventOccurrence[] {
  const firstStart = new Date(event.starts_at);
  const durationMs = new Date(event.ends_at).getTime() - firstStart.getTime();
  const anchor = toIstanbulDateString(firstStart);

  if (event.repeat === null) {
    const end = new Date(event.ends_at);
    return firstStart < rangeEnd && end > rangeStart
      ? [occurrenceOf(event, firstStart, end, anchor)]
      : [];
  }

  const timeOfDay = formatHHmm(firstStart);
  // An occurrence overlaps the range when it ends after rangeStart, i.e.
  // starts after (rangeStart - duration); begin at that day's slot.
  const earliestStartDay = toIstanbulDateString(new Date(rangeStart.getTime() - durationMs));
  const firstIndex = firstOccurrenceIndexOnOrAfter(anchor, event.repeat, earliestStartDay);

  const occurrences: EventOccurrence[] = [];
  for (let i = 0; i < MAX_OCCURRENCES_PER_EVENT; i += 1) {
    const day = occurrenceYmd(anchor, event.repeat, firstIndex + i);
    if (event.repeat_until !== null && day > event.repeat_until) break;
    const start = istanbulInstant(day, timeOfDay);
    if (start >= rangeEnd) break;
    if (skipped.has(day)) continue;
    const end = new Date(start.getTime() + durationMs);
    if (end > rangeStart) occurrences.push(occurrenceOf(event, start, end, day));
  }
  return occurrences;
}

/** All-day first, then by start time, then by title — the order of a day cell. */
export function compareOccurrences(a: EventOccurrence, b: EventOccurrence): number {
  if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
  const delta = new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
  if (delta !== 0) return delta;
  return a.title.localeCompare(b.title, "tr");
}

/** Expands every event over the range, in display order. */
export function expandEvents(
  events: readonly CalendarEvent[],
  skippedByEvent: ReadonlyMap<string, ReadonlySet<string>>,
  rangeStart: Date,
  rangeEnd: Date,
): EventOccurrence[] {
  const none: ReadonlySet<string> = new Set();
  return events
    .flatMap((event) =>
      expandEvent(event, skippedByEvent.get(event.id) ?? none, rangeStart, rangeEnd),
    )
    .sort(compareOccurrences);
}

/** The Istanbul days an occurrence touches, first to last. A timed event
 *  ending exactly at midnight does not touch the day it ends on. */
export function occurrenceDays(occurrence: Pick<EventOccurrence, "starts_at" | "ends_at">): string[] {
  const first = toIstanbulDateString(occurrence.starts_at);
  const last = toIstanbulDateString(new Date(new Date(occurrence.ends_at).getTime() - 1));
  const days: string[] = [];
  for (let day = first; day <= last; day = addDaysToYmd(day, 1)) days.push(day);
  return days;
}

/** Occurrences bucketed under every visible day they touch. */
export function groupOccurrencesByDay(
  occurrences: readonly EventOccurrence[],
  days: readonly string[],
): Map<string, EventOccurrence[]> {
  const byDay = new Map<string, EventOccurrence[]>(days.map((day) => [day, []]));
  for (const occurrence of occurrences) {
    for (const day of occurrenceDays(occurrence)) byDay.get(day)?.push(occurrence);
  }
  return byDay;
}
