"use client";

/**
 * The left column of Takvim: a mini month for jumping around, the calendars
 * with a colored tick each to show or hide them, and the two extra layers
 * (Anımsatıcılar, Teslimatlar).
 */
import { ChevronLeft, ChevronRight, Check, ListChecks, Pencil, Plus, Truck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  createCalendarAction,
  deleteCalendarAction,
  updateCalendarAction,
} from "@/features/calendar/application/calendar-actions";
import { isSameMonth, visibleRange, type VisibleRange } from "@/features/calendar/domain/range";
import {
  calendarHref,
  dayNumber,
  longDay,
  monthCaption,
  WEEKDAY_SHORT,
} from "@/features/calendar/ui/calendar-format";
import { NameColorDialog, type NameColorDialogText } from "@/components/name-color-dialog";
import { cn } from "@/lib/utils";
import { ACCENT_COLOR_HEX } from "@/shared/palette/accent-colors";
import { addMonthsToYmd } from "@/shared/utils/date";

import type { Calendar } from "@/features/calendar/domain/calendar";
import type { CalendarPrefs } from "@/features/calendar/ui/calendar-prefs";

const CALENDAR_DIALOG_TEXT: NameColorDialogText = {
  createTitle: "Yeni Takvim",
  editTitle: "Takvimi Düzenle",
  nameLabel: "Takvim adı",
  namePlaceholder: "ör. Veteriner",
  colorLabel: "Takvim rengi",
  deleteWarning: "Bu takvim, içindeki tüm etkinliklerle birlikte kalıcı olarak silinecek.",
};

function MiniMonth({ range, today }: { range: VisibleRange; today: string }) {
  const month = visibleRange("ay", range.date);
  const navButton =
    "flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div>
      <div className="flex items-center justify-between pb-1 pl-1.5">
        <span className="text-sm font-semibold">{monthCaption(range.date)}</span>
        <span className="flex">
          <Link
            href={calendarHref(range.view, addMonthsToYmd(range.date, -1))}
            aria-label="Önceki ay"
            className={navButton}
          >
            <ChevronLeft className="size-4" />
          </Link>
          <Link
            href={calendarHref(range.view, addMonthsToYmd(range.date, 1))}
            aria-label="Sonraki ay"
            className={navButton}
          >
            <ChevronRight className="size-4" />
          </Link>
        </span>
      </div>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAY_SHORT.map((weekday) => (
          <span key={weekday} aria-hidden className="pb-0.5 text-[0.65rem] text-muted-foreground">
            {weekday.slice(0, 1)}
          </span>
        ))}
        {month.days.map((day) => {
          const isToday = day === today;
          // The days the main view is showing (a single day in the month view).
          const inView =
            range.view === "ay" ? day === range.date : day >= range.start && day < range.end;
          return (
            <Link
              key={day}
              href={calendarHref(range.view, day)}
              aria-label={longDay(day)}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "mx-auto flex size-7 items-center justify-center rounded-full text-xs tabular-nums outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring",
                isToday
                  ? "bg-[#FF3B30] font-semibold text-white"
                  : inView
                    ? "bg-muted font-medium"
                    : "hover:bg-muted/70",
                !isToday && !isSameMonth(day, range.date) && "text-muted-foreground/50",
              )}
            >
              {dayNumber(day)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function LayerToggle({
  checked,
  onToggle,
  color,
  label,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  color: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] text-white transition-colors duration-150"
        style={{ borderColor: color, backgroundColor: checked ? color : "transparent" }}
      >
        {checked ? <Check aria-hidden className="size-3" strokeWidth={3.5} /> : null}
      </span>
      {children}
    </button>
  );
}

export function CalendarSidebar({
  range,
  today,
  calendars,
  prefs,
  onPrefsChange,
}: {
  range: VisibleRange;
  today: string;
  calendars: readonly Calendar[];
  prefs: CalendarPrefs;
  onPrefsChange: (next: CalendarPrefs) => void;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Calendar | null>(null);

  const toggleCalendar = (id: string) => {
    const hidden = prefs.hiddenCalendars.includes(id);
    onPrefsChange({
      ...prefs,
      hiddenCalendars: hidden
        ? prefs.hiddenCalendars.filter((other) => other !== id)
        : [...prefs.hiddenCalendars, id],
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <MiniMonth range={range} today={today} />

      <div>
        <h3 className="px-2 pb-1 text-xs font-semibold text-muted-foreground">Takvimler</h3>
        <ul>
          {calendars.map((calendar) => (
            <li key={calendar.id} className="group/cal flex items-center">
              <LayerToggle
                checked={!prefs.hiddenCalendars.includes(calendar.id)}
                onToggle={() => toggleCalendar(calendar.id)}
                color={ACCENT_COLOR_HEX[calendar.color]}
                label={`${calendar.name} takvimini göster`}
              >
                <span className="min-w-0 truncate">{calendar.name}</span>
              </LayerToggle>
              <button
                type="button"
                aria-label={`${calendar.name} takvimini düzenle`}
                onClick={() => setEditing(calendar)}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/cal:opacity-100 pointer-coarse:opacity-100"
              >
                <Pencil className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus aria-hidden className="size-4" />
          Takvim Ekle
        </button>
      </div>

      <div>
        <h3 className="px-2 pb-1 text-xs font-semibold text-muted-foreground">Diğer</h3>
        <div className="flex">
          <LayerToggle
            checked={prefs.showReminders}
            onToggle={() => onPrefsChange({ ...prefs, showReminders: !prefs.showReminders })}
            color={ACCENT_COLOR_HEX.gray}
            label="Anımsatıcıları göster"
          >
            <ListChecks aria-hidden className="size-3.5 text-muted-foreground" />
            <span>Anımsatıcılar</span>
          </LayerToggle>
        </div>
        <div className="flex">
          <LayerToggle
            checked={prefs.showDeliveries}
            onToggle={() => onPrefsChange({ ...prefs, showDeliveries: !prefs.showDeliveries })}
            color={ACCENT_COLOR_HEX.gray}
            label="Teslimatları göster"
          >
            <Truck aria-hidden className="size-3.5 text-muted-foreground" />
            <span>Teslimatlar</span>
          </LayerToggle>
        </div>
      </div>

      <NameColorDialog
        open={creating}
        onOpenChange={setCreating}
        text={CALENDAR_DIALOG_TEXT}
        onSave={async (value) => {
          const result = await createCalendarAction(value);
          if (!result.ok) {
            toast.error(result.error.message);
            return false;
          }
          router.refresh();
          return true;
        }}
      />
      <NameColorDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        initial={editing ? { name: editing.name, color: editing.color } : undefined}
        text={CALENDAR_DIALOG_TEXT}
        onSave={async (value) => {
          if (!editing) return false;
          const result = await updateCalendarAction({ id: editing.id, ...value });
          if (!result.ok) {
            toast.error(result.error.message);
            return false;
          }
          router.refresh();
          return true;
        }}
        onDelete={async () => {
          if (!editing) return false;
          const result = await deleteCalendarAction({ id: editing.id });
          if (!result.ok) {
            toast.error(result.error.message);
            return false;
          }
          toast.success("Takvim silindi.");
          router.refresh();
          return true;
        }}
      />
    </div>
  );
}
