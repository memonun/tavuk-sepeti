/**
 * How the calendar's dates and colors read on the page.
 */
import { tr } from "date-fns/locale/tr";
import { formatInTimeZone } from "date-fns-tz";

import { addDaysToYmd, istanbulInstant } from "@/shared/utils/date";
import { ACCENT_COLOR_HEX, accentTint, type AccentColor } from "@/shared/palette/accent-colors";

import type { CalendarView } from "@/features/calendar/domain/calendar";
import type { VisibleRange } from "@/features/calendar/domain/range";

const TZ = "Europe/Istanbul";

/** Monday-first, matching the grid columns. */
export const WEEKDAY_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;

function fmt(ymd: string, pattern: string): string {
  return formatInTimeZone(istanbulInstant(ymd), TZ, pattern, { locale: tr });
}

/** The toolbar title, split so the first part can be set heavier — Apple's
 *  "**Ekim** 2026". */
export function rangeTitle(range: VisibleRange): { strong: string; light: string } {
  if (range.view === "ay") {
    return { strong: fmt(range.date, "LLLL"), light: fmt(range.date, "yyyy") };
  }
  if (range.view === "gun") {
    return { strong: fmt(range.date, "d MMMM"), light: fmt(range.date, "yyyy, EEEE") };
  }
  const last = addDaysToYmd(range.end, -1);
  const sameMonth = range.start.slice(0, 7) === last.slice(0, 7);
  return {
    strong: sameMonth
      ? `${fmt(range.start, "d")} – ${fmt(last, "d MMMM")}`
      : `${fmt(range.start, "d MMM")} – ${fmt(last, "d MMM")}`,
    light: fmt(last, "yyyy"),
  };
}

/** "Ekim 2026" — the mini month's caption. */
export function monthCaption(ymd: string): string {
  return fmt(ymd, "LLLL yyyy");
}

/** "11 Ekim Pazar" — a day spelled out (dialog captions, aria labels). */
export function longDay(ymd: string): string {
  return fmt(ymd, "d MMMM EEEE");
}

/** Day of month without a leading zero. */
export function dayNumber(ymd: string): string {
  return String(Number(ymd.slice(8, 10)));
}

export function calendarHref(view: CalendarView, date: string): string {
  return `/takvim?gorunum=${view}&tarih=${date}`;
}

/**
 * Inline style of an event block: a wash of the calendar's color with text
 * pulled toward the theme's foreground, so one hex per color reads on both the
 * light and the dark surface.
 */
export function eventTintStyle(color: AccentColor): React.CSSProperties {
  return {
    backgroundColor: accentTint(color, 0.18),
    color: `color-mix(in oklab, ${ACCENT_COLOR_HEX[color]} 62%, var(--foreground))`,
  };
}
