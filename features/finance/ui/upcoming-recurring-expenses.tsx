/** "Yaklaşan Rutin Giderler" — compact preview card for Finans Özeti (spec
 *  §20). `~` marks a variable/estimated amount, never a firm figure. */
import { formatDate } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";

import type { UpcomingRecurringExpense } from "@/features/finance/domain/recurring-expense-template";

export function UpcomingRecurringExpenses({ items }: { items: readonly UpcomingRecurringExpense[] }) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">Yaklaşan Rutin Giderler</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.templateId} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {formatDate(item.nextRunAt)} — {item.name}
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {item.isEstimate ? "~ " : ""}
              {formatTRY(item.amountMinor)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
