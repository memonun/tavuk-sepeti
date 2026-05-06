"use client";

/**
 * Top-center date pager for /routes. Three controls in one row:
 *   ←   [ Bugün · 6 May 2026 ]   →
 *
 * The center pill spawns the browser's native date picker on click — no
 * extra calendar dependency. Arrows shift the URL `?date=` by ±1 day.
 *
 * The label adapts to today/yesterday/tomorrow ("Bugün", "Yarın", "Dün")
 * with the formatted date underneath, so the operator never has to do
 * mental math to know whether they're on today's route.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  addDaysToYmd,
  formatLongDate,
  todayInIstanbul,
  ymdDayDiff,
} from "@/shared/utils/date";

interface RouteDatePagerProps {
  date: string; // YYYY-MM-DD
}

function relativeLabel(date: string): string {
  const diff = ymdDayDiff(todayInIstanbul(), date);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff === -1) return "Dün";
  if (diff > 1 && diff <= 6) return `${diff} gün sonra`;
  if (diff < -1 && diff >= -6) return `${Math.abs(diff)} gün önce`;
  return "";
}

export function RouteDatePager({ date }: RouteDatePagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  const navigate = (nextDate: string) => {
    const updated = new URLSearchParams(params.toString());
    updated.set("date", nextDate);
    // Optimization is date-specific; flip it off so the user explicitly
    // re-runs Optimize for the new day's orders.
    updated.delete("optimize");
    startTransition(() =>
      router.replace(`${pathname}?${updated.toString()}`),
    );
  };

  const goPrev = () => navigate(addDaysToYmd(date, -1));
  const goNext = () => navigate(addDaysToYmd(date, 1));

  const openPicker = () => {
    const input = hiddenInputRef.current;
    if (!input) return;
    // showPicker() is the standard way to open a native date picker
    // programmatically (Chrome 99+, Safari 16+, Firefox 101+). Fall back
    // to focus() for older engines.
    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
        return;
      } catch {
        // showPicker can throw in non-user-gesture contexts; fall through.
      }
    }
    input.focus();
    input.click();
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) navigate(e.target.value);
  };

  const relative = relativeLabel(date);
  const isToday = relative === "Bugün";

  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-10 w-10"
        disabled={pending}
        onClick={goPrev}
        aria-label="Önceki gün"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>

      <div className="relative">
        <button
          type="button"
          onClick={openPicker}
          disabled={pending}
          className="group flex min-w-[220px] flex-col items-center rounded-lg border bg-card px-4 py-2 text-center shadow-sm transition-colors hover:border-primary/40 hover:bg-accent disabled:opacity-60 sm:min-w-[260px]"
          aria-label="Tarih seç"
        >
          {relative ? (
            <span
              className={`text-xs font-medium uppercase tracking-wider ${
                isToday ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {relative}
            </span>
          ) : null}
          <span className="text-base font-semibold">{formatLongDate(date)}</span>
        </button>
        {/* Hidden native date input — the pill button calls showPicker()
            on it. Using a real input keeps a11y, mobile keyboards, and
            keyboard-only UX correct without a custom calendar component. */}
        <input
          ref={hiddenInputRef}
          type="date"
          value={date}
          onChange={onPick}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-10 w-10"
        disabled={pending}
        onClick={goNext}
        aria-label="Sonraki gün"
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
}
