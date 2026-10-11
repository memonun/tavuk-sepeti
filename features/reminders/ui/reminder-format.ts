/**
 * How reminder dates read on the page: relative for the days around today
 * ("Bugün", "Yarın", "Dün"), a calendar date otherwise.
 */
import { tr } from "date-fns/locale/tr";
import { formatInTimeZone } from "date-fns-tz";

import { formatHHmm, istanbulInstant, toIstanbulDateString, ymdDayDiff } from "@/shared/utils/date";

const TZ = "Europe/Istanbul";

function relativeDay(day: string, today: string): string | null {
  switch (ymdDayDiff(today, day)) {
    case 0:
      return "Bugün";
    case 1:
      return "Yarın";
    case -1:
      return "Dün";
    default:
      return null;
  }
}

/** Section header of a day: "Bugün", "Yarın", "12 Ekim Pazartesi", "3 Ocak 2027". */
export function dayHeading(day: string, today: string): string {
  const relative = relativeDay(day, today);
  if (relative) return relative;
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return formatInTimeZone(istanbulInstant(day), TZ, sameYear ? "d MMMM EEEE" : "d MMMM yyyy", {
    locale: tr,
  });
}

/** A reminder's due line: "Bugün", "Yarın, 14:30", "12 Eki", "3 Oca 2027, 09:00". */
export function dueLabel(
  due: { readonly due_at: string; readonly due_all_day: boolean },
  today: string,
): string {
  const day = toIstanbulDateString(due.due_at);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  const dayText =
    relativeDay(day, today) ??
    formatInTimeZone(istanbulInstant(day), TZ, sameYear ? "d MMM" : "d MMM yyyy", { locale: tr });
  return due.due_all_day ? dayText : `${dayText}, ${formatHHmm(due.due_at)}`;
}
