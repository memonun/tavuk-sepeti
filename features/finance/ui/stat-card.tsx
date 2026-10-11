/**
 * Reusable Finans stat card. Copies the exact markup from
 * app/(admin)/admin/page.tsx's dashboard cards rather than touching that
 * file — self-containment (CLAUDE.md §2): a new feature shouldn't require
 * editing an unrelated existing page.
 */
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative";
}

export function StatCard({ title, value, hint, tone = "default" }: StatCardProps) {
  return (
    // A container, so the figure can size itself to the card: an amount is never
    // wrapped or cut mid-number, it gets smaller instead (two-up on a phone, a
    // seven-figure total still has to fit on one line).
    <div className="@container rounded-2xl border bg-card p-4 text-card-foreground shadow-(--admin-shadow-sm)">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p
        className={cn(
          "mt-1.5 text-[clamp(0.8125rem,calc(100cqw/8.4),1.5rem)] leading-tight font-semibold whitespace-nowrap tabular-nums",
          tone === "positive" && "text-emerald-600 dark:text-emerald-400",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
