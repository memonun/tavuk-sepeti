import "server-only";

/**
 * Everything that happens in a range of days: the calendars, the event
 * occurrences, the dated reminders (reminders feature) and the per-day route
 * deliveries (orders feature). One call feeds both the /takvim page and the
 * MCP connector's get_calendar tool. The four reads are independent and run
 * in parallel.
 */
import { calendarRangeSchema } from "@/features/calendar/domain/calendar.schema";
import { expandEvents } from "@/features/calendar/domain/occurrences";
import { listEventsForRange } from "@/features/calendar/infrastructure/calendar-event.repository";
import { listCalendars } from "@/features/calendar/infrastructure/calendar.repository";
import { getDeliveryCountsByDay } from "@/features/orders/application/get-delivery-counts-by-day";
import { listRemindersInRange } from "@/features/reminders/application/list-reminders-in-range";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";
import { addDaysToYmd, istanbulInstant } from "@/shared/utils/date";

import type {
  Calendar,
  CalendarReminder,
  DeliveryDay,
  EventOccurrence,
} from "@/features/calendar/domain/calendar";

export interface CalendarRangeData {
  readonly calendars: readonly Calendar[];
  readonly occurrences: readonly EventOccurrence[];
  readonly reminders: readonly CalendarReminder[];
  readonly deliveries: readonly DeliveryDay[];
  /** True when a read hit its cap and the range is only partly shown. */
  readonly truncated: boolean;
}

/** `start` is the first day (inclusive), `end` the day after the last one
 *  (exclusive) — both YYYY-MM-DD Istanbul days. */
export async function getCalendarRange(
  start: string,
  end: string,
): Promise<Result<CalendarRangeData, AppError>> {
  const from = istanbulInstant(start);
  const to = istanbulInstant(end);

  const [calendars, events, reminders, deliveries] = await Promise.all([
    listCalendars(),
    listEventsForRange(from, to),
    listRemindersInRange(from.toISOString(), to.toISOString()),
    getDeliveryCountsByDay(start, addDaysToYmd(end, -1)),
  ]);
  if (!calendars.ok) return err(calendars.error);
  if (!events.ok) return err(events.error);
  if (!reminders.ok) return err(reminders.error);
  if (!deliveries.ok) return err(deliveries.error);

  return ok({
    calendars: calendars.value,
    occurrences: expandEvents(events.value.events, events.value.skippedByEvent, from, to),
    reminders: reminders.value.reminders,
    deliveries: deliveries.value,
    truncated: events.value.truncated || reminders.value.truncated,
  });
}

/**
 * The same read for an explicit `{ from, to }` day range (both inclusive,
 * bounded by calendarRangeSchema) — the MCP connector's get_calendar tool.
 */
export async function getCalendarForDays(
  raw: unknown,
): Promise<Result<CalendarRangeData, AppError>> {
  const parsed = calendarRangeSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz tarih aralığı.",
      }),
    );
  }
  return getCalendarRange(parsed.data.from, addDaysToYmd(parsed.data.to, 1));
}
