/**
 * Three at-a-glance numbers above the calendar. Compact on purpose — on a
 * phone the calendar itself should start above the fold.
 */
import { cn } from "@/lib/utils";

import type { AgendaWeekSummary } from "@/features/agenda/domain/agenda-week";

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "alert" | undefined;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-card-foreground">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "alert" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function AgendaSummary({
  summary,
  overdueCount,
  isCurrentWeek,
}: {
  summary: AgendaWeekSummary;
  overdueCount: number;
  isCurrentWeek: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {/* "Bugün" only means something while today is on screen. */}
      <Tile label="Bugün" value={isCurrentWeek ? String(summary.openToday) : "—"} />
      <Tile
        label="Geciken"
        value={String(overdueCount)}
        tone={overdueCount > 0 ? "alert" : undefined}
      />
      <Tile label="Hafta" value={`${summary.doneThisWeek}/${summary.totalThisWeek}`} />
    </div>
  );
}
