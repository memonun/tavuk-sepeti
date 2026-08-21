/**
 * Explains the background wash on the Orders grid rows (see
 * order-row-color.ts) — a supplementary cue, so the legend itself is
 * decorative-only and never the sole source of the status information.
 */
import { cn } from "@/lib/utils";

const LEGEND_ITEMS = [
  { swatch: "bg-row-status-pending", label: "Bekliyor" },
  { swatch: "bg-row-status-confirmed", label: "Onaylı" },
  { swatch: "bg-row-status-paid", label: "Teslim · Ödendi" },
  { swatch: "bg-row-status-unpaid", label: "Teslim · Ödenmedi" },
] as const;

export function OrderRowColorLegend({ className }: { className?: string }) {
  return (
    <div className={cn("hidden items-center gap-3 sm:flex", className)}>
      {LEGEND_ITEMS.map((item) => (
        <span
          key={item.label}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            className={cn("h-3 w-5 rounded-sm border border-border/60", item.swatch)}
            aria-hidden
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}
