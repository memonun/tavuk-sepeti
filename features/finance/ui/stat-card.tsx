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
    <div className="rounded-lg border bg-card p-4 text-card-foreground">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{title}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums",
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
