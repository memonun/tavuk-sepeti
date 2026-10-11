/**
 * Takvim — the admins' shared calendar, modeled on Apple Calendar: colored
 * calendars holding timed or all-day events, which may repeat. Persisted in
 * `calendars` / `calendar_events` / `calendar_event_exceptions`
 * (supabase/migrations/20261010221830_takvim_ve_animsaticilar.sql).
 *
 * A repeating event is ONE row describing the whole series; what the page
 * draws are its occurrences, expanded for the visible range by
 * features/calendar/domain/occurrences.ts.
 *
 * Instants are ISO strings, not Date objects: every one of these crosses the
 * Server → Client Component boundary and the MCP connector's JSON as-is.
 */
import type { AccentColor } from "@/shared/palette/accent-colors";
import type { RepeatRule } from "@/shared/utils/repeat-rule";

export interface Calendar {
  readonly id: string;
  readonly name: string;
  readonly color: AccentColor;
  readonly sort_order: number;
}

export interface CalendarEvent {
  readonly id: string;
  readonly calendar_id: string;
  readonly title: string;
  readonly notes: string | null;
  readonly location: string | null;
  readonly all_day: boolean;
  /** For a repeating event: the FIRST occurrence. */
  readonly starts_at: string;
  /** Exclusive. All-day: the Istanbul midnight after the last day. */
  readonly ends_at: string;
  /** Non-null iff the event repeats (the DB enforces the pair). */
  readonly repeat: RepeatRule | null;
  /** Last Istanbul day an occurrence may start on; null = forever. */
  readonly repeat_until: string | null;
}

/** One concrete appearance of an event inside a visible range. */
export interface EventOccurrence {
  /** Unique per occurrence: `<event id>:<occurrence_date>`. */
  readonly key: string;
  readonly event_id: string;
  readonly calendar_id: string;
  readonly title: string;
  readonly notes: string | null;
  readonly location: string | null;
  readonly all_day: boolean;
  readonly starts_at: string;
  readonly ends_at: string;
  /** The Istanbul day this occurrence starts on — its identity in the series. */
  readonly occurrence_date: string;
  /** The series this occurrence belongs to; null for a one-off event. An edit
   *  rewrites the whole series, so the occurrence carries what that takes. */
  readonly repeat: RepeatRule | null;
  readonly repeat_until: string | null;
  /** The event's own stored span — for a series, its FIRST occurrence. */
  readonly series_starts_at: string;
  readonly series_ends_at: string;
}

/** A dated reminder shown on the calendar (read through the reminders
 *  feature's application API; this is the calendar's own view of it). */
export interface CalendarReminder {
  readonly id: string;
  readonly title: string;
  readonly due_at: string;
  readonly due_all_day: boolean;
  readonly completed: boolean;
  readonly list_id: string;
  readonly list_name: string;
  readonly color: AccentColor;
}

/** Route deliveries scheduled for one day (read through the orders feature). */
export interface DeliveryDay {
  /** YYYY-MM-DD. */
  readonly day: string;
  readonly total: number;
  readonly delivered: number;
}

export const CALENDAR_VIEWS = ["ay", "hafta", "gun"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const CALENDAR_VIEW_LABELS: Readonly<Record<CalendarView, string>> = {
  gun: "Gün",
  hafta: "Hafta",
  ay: "Ay",
};
