import "server-only";

/**
 * Everything the /takvim page renders for the requested view and day.
 */
import {
  getCalendarRange,
  type CalendarRangeData,
} from "@/features/calendar/application/get-calendar-range";
import {
  calendarPageQuerySchema,
  DEFAULT_CALENDAR_VIEW,
} from "@/features/calendar/domain/calendar.schema";
import { shiftDate, visibleRange, type VisibleRange } from "@/features/calendar/domain/range";
import { AppError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";
import { todayInIstanbul } from "@/shared/utils/date";

export interface CalendarPageData extends CalendarRangeData {
  /** Today's Istanbul day (YYYY-MM-DD). */
  readonly today: string;
  /** The instant the page was rendered — where the "now" line sits. */
  readonly now: string;
  readonly range: VisibleRange;
  /** The focused day one step back / forward, for the navigation arrows. */
  readonly prevDate: string;
  readonly nextDate: string;
}

export async function getCalendarPage(
  rawQuery: unknown,
): Promise<Result<CalendarPageData, AppError>> {
  // Every field has a .catch() fallback, so only a non-object input can fail.
  const parsed = calendarPageQuerySchema.safeParse(rawQuery);
  const query = parsed.success ? parsed.data : {};

  const today = todayInIstanbul();
  const view = query.gorunum ?? DEFAULT_CALENDAR_VIEW;
  const range = visibleRange(view, query.tarih ?? today);

  const data = await getCalendarRange(range.start, range.end);
  if (!data.ok) return err(data.error);

  return ok({
    ...data.value,
    today,
    now: new Date().toISOString(),
    range,
    prevDate: shiftDate(view, range.date, -1),
    nextDate: shiftDate(view, range.date, 1),
  });
}
