/**
 * Week navigation + category filter chips. Plain links (Server Component):
 * the week and the filter live in the URL, each preserving the other.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import {
  AGENDA_CATEGORIES,
  AGENDA_CATEGORY_LABELS,
  type AgendaCategory,
} from "@/features/agenda/domain/agenda-task";
import { AGENDA_CATEGORY_DOT } from "@/features/agenda/ui/agenda-category-style";
import { formatWeekRange } from "@/features/agenda/ui/agenda-format";
import { agendaHref } from "@/features/agenda/ui/agenda-href";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { AgendaWeek } from "@/features/agenda/domain/agenda-week";

export function AgendaWeekNav({
  week,
  isCurrentWeek,
  prevWeekStart,
  nextWeekStart,
  category,
}: {
  week: AgendaWeek;
  isCurrentWeek: boolean;
  prevWeekStart: string;
  nextWeekStart: string;
  category: AgendaCategory | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href={agendaHref({ week: prevWeekStart, category })}
        className={buttonVariants({ variant: "outline", size: "icon" })}
        aria-label="Önceki hafta"
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <div className="flex min-w-0 flex-col items-center text-center">
        <span className="text-sm font-medium tabular-nums">{formatWeekRange(week)}</span>
        {isCurrentWeek ? (
          <span className="text-xs text-muted-foreground">Bu hafta</span>
        ) : (
          <Link
            href={agendaHref({ category })}
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            Bu haftaya dön
          </Link>
        )}
      </div>
      <Link
        href={agendaHref({ week: nextWeekStart, category })}
        className={buttonVariants({ variant: "outline", size: "icon" })}
        aria-label="Sonraki hafta"
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function AgendaCategoryFilter({
  week,
  isCurrentWeek,
  category,
}: {
  week: AgendaWeek;
  isCurrentWeek: boolean;
  category: AgendaCategory | null;
}) {
  // Keep the current-week URL clean (no ?hafta=) so it stays "this week"
  // when bookmarked; any other week is pinned explicitly.
  const weekParam = isCurrentWeek ? null : week.start;
  const chip = (active: boolean) =>
    cn(
      "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "bg-background text-foreground hover:bg-muted",
    );

  return (
    // Scrolls sideways on a narrow phone instead of wrapping into three rows.
    <nav aria-label="Kategori filtresi" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      <Link
        href={agendaHref({ week: weekParam })}
        className={chip(category === null)}
        aria-current={category === null ? "page" : undefined}
      >
        Tümü
      </Link>
      {AGENDA_CATEGORIES.map((c) => (
        <Link
          key={c}
          href={agendaHref({ week: weekParam, category: c })}
          className={chip(category === c)}
          aria-current={category === c ? "page" : undefined}
        >
          <span aria-hidden className={cn("size-2 rounded-full", AGENDA_CATEGORY_DOT[c])} />
          {AGENDA_CATEGORY_LABELS[c]}
        </Link>
      ))}
    </nav>
  );
}
