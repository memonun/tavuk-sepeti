"use client";

/**
 * The Takvim page: sidebar, toolbar and the selected view. The range itself is
 * server state (the URL's `gorunum` / `tarih`), so moving around is plain link
 * navigation; this component owns only what is local to the browser — which
 * layers are shown and which event dialog is open.
 */
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { groupOccurrencesByDay } from "@/features/calendar/domain/occurrences";
import { CALENDAR_VIEW_LABELS, CALENDAR_VIEWS } from "@/features/calendar/domain/calendar";
import { calendarHref, rangeTitle } from "@/features/calendar/ui/calendar-format";
import { useCalendarPrefs } from "@/features/calendar/ui/calendar-prefs";
import { CalendarSidebar } from "@/features/calendar/ui/calendar-sidebar";
import { EventDialog, type EventDialogTarget } from "@/features/calendar/ui/event-dialog";
import { MonthAgendaView } from "@/features/calendar/ui/month-agenda-view";
import { MonthView } from "@/features/calendar/ui/month-view";
import { TimeGridView } from "@/features/calendar/ui/time-grid-view";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTableRealtime } from "@/shared/realtime/use-table-realtime";
import { toIstanbulDateString } from "@/shared/utils/date";

import type { CalendarPageData } from "@/features/calendar/application/get-calendar-page";
import type { CalendarReminder, DeliveryDay } from "@/features/calendar/domain/calendar";
import type { AccentColor } from "@/shared/palette/accent-colors";

const REALTIME_TABLES = [
  "calendars",
  "calendar_events",
  "calendar_event_exceptions",
  "reminders",
  "reminder_lists",
] as const;

const NAV_BUTTON =
  "flex h-8 items-center justify-center rounded-lg outline-none transition-transform duration-100 ease-out hover:bg-muted active:scale-95 focus-visible:ring-2 focus-visible:ring-ring";

export function CalendarShell({ data }: { data: CalendarPageData }) {
  const { range, today } = data;
  const [prefs, setPrefs] = useCalendarPrefs();
  const [dialog, setDialog] = useState<EventDialogTarget | null>(null);

  // A second admin's changes (and the Claude connector's) show up on their own.
  useTableRealtime({ tables: REALTIME_TABLES, channelPrefix: "calendar-page" });

  const colorByCalendar = useMemo(
    () => new Map(data.calendars.map((calendar) => [calendar.id, calendar.color])),
    [data.calendars],
  );
  const colorOf = (calendarId: string): AccentColor => colorByCalendar.get(calendarId) ?? "blue";

  const occurrencesByDay = useMemo(() => {
    const hidden = new Set(prefs.hiddenCalendars);
    return groupOccurrencesByDay(
      data.occurrences.filter((occurrence) => !hidden.has(occurrence.calendar_id)),
      range.days,
    );
  }, [data.occurrences, prefs.hiddenCalendars, range.days]);

  const remindersByDay = useMemo(() => {
    const byDay = new Map<string, CalendarReminder[]>();
    if (!prefs.showReminders) return byDay;
    for (const reminder of data.reminders) {
      const day = toIstanbulDateString(reminder.due_at);
      const bucket = byDay.get(day);
      if (bucket) bucket.push(reminder);
      else byDay.set(day, [reminder]);
    }
    return byDay;
  }, [data.reminders, prefs.showReminders]);

  const deliveriesByDay = useMemo(() => {
    const byDay = new Map<string, DeliveryDay>();
    if (!prefs.showDeliveries) return byDay;
    for (const delivery of data.deliveries) byDay.set(delivery.day, delivery);
    return byDay;
  }, [data.deliveries, prefs.showDeliveries]);

  const title = rangeTitle(range);
  // "+" starts an event on the focused day, or today when it is in view.
  const newEventDay = today >= range.start && today < range.end ? today : range.date;

  return (
    <div className="flex h-[calc(100dvh-4rem-var(--admin-tabbar-h,0px))] flex-col gap-4 overflow-y-auto lg:flex-row lg:gap-5 lg:overflow-hidden">
      <aside className="order-2 shrink-0 pb-6 lg:order-1 lg:w-60 lg:overflow-y-auto lg:pr-1">
        <CalendarSidebar
          range={range}
          today={today}
          calendars={data.calendars}
          prefs={prefs}
          onPrefsChange={setPrefs}
        />
      </aside>

      <section
        aria-label="Takvim"
        className="order-1 flex h-[calc(100dvh-5rem-var(--admin-tabbar-h,0px))] min-w-0 shrink-0 flex-col lg:order-2 lg:h-auto lg:flex-1 lg:shrink"
      >
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pb-2">
          <h2 className="text-2xl leading-tight tracking-[-0.02em] sm:text-3xl">
            <span className="font-bold">{title.strong}</span>{" "}
            <span className="font-light text-muted-foreground">{title.light}</span>
          </h2>

          <div className="flex items-center gap-2">
            <nav aria-label="Görünüm" className="flex rounded-lg bg-muted p-0.5">
              {[...CALENDAR_VIEWS].reverse().map((view) => {
                const selected = view === range.view;
                return (
                  <Link
                    key={view}
                    href={calendarHref(view, range.date)}
                    aria-current={selected ? "page" : undefined}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "bg-background font-medium shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {CALENDAR_VIEW_LABELS[view]}
                  </Link>
                );
              })}
            </nav>

            <nav aria-label="Tarih" className="flex items-center">
              <Link
                href={calendarHref(range.view, data.prevDate)}
                aria-label="Önceki"
                className={cn(NAV_BUTTON, "w-8")}
              >
                <ChevronLeft className="size-4" />
              </Link>
              <Link href={calendarHref(range.view, today)} className={cn(NAV_BUTTON, "px-2.5 text-sm")}>
                Bugün
              </Link>
              <Link
                href={calendarHref(range.view, data.nextDate)}
                aria-label="Sonraki"
                className={cn(NAV_BUTTON, "w-8")}
              >
                <ChevronRight className="size-4" />
              </Link>
            </nav>

            <Button
              size="icon"
              aria-label="Etkinlik ekle"
              disabled={data.calendars.length === 0}
              onClick={() => setDialog({ mode: "create", date: newEventDay, time: "09:00" })}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </header>

        {data.truncated ? (
          <p className="pb-1 text-xs text-muted-foreground">
            Bu aralıkta çok fazla kayıt var; yalnızca ilk kısmı gösteriliyor.
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
          {range.view === "ay" ? (
            <>
              {/* Phone: dots + the selected day's list. Remounted per month so
                  the selection starts on today (or the 1st) again. */}
              <MonthAgendaView
                key={range.start}
                className="md:hidden"
                range={range}
                today={today}
                occurrencesByDay={occurrencesByDay}
                remindersByDay={remindersByDay}
                deliveriesByDay={deliveriesByDay}
                colorOf={colorOf}
                onCreate={(date) => setDialog({ mode: "create", date })}
                onOpen={(occurrence) => setDialog({ mode: "edit", occurrence })}
              />
              <div className="hidden min-h-0 flex-1 flex-col md:flex">
                <MonthView
                  range={range}
                  today={today}
                  occurrencesByDay={occurrencesByDay}
                  remindersByDay={remindersByDay}
                  deliveriesByDay={deliveriesByDay}
                  colorOf={colorOf}
                  onCreate={(date) => setDialog({ mode: "create", date })}
                  onOpen={(occurrence) => setDialog({ mode: "edit", occurrence })}
                />
              </div>
            </>
          ) : (
            <TimeGridView
              range={range}
              today={today}
              now={data.now}
              occurrencesByDay={occurrencesByDay}
              remindersByDay={remindersByDay}
              deliveriesByDay={deliveriesByDay}
              colorOf={colorOf}
              onCreate={(date, time) => setDialog({ mode: "create", date, time })}
              onOpen={(occurrence) => setDialog({ mode: "edit", occurrence })}
            />
          )}
        </div>
      </section>

      <EventDialog target={dialog} calendars={data.calendars} onClose={() => setDialog(null)} />
    </div>
  );
}
