/** "Gider Dağılımı" — same horizontal-bar treatment as channel revenue. */
import { formatTRY } from "@/shared/utils/money";

import type { FinanceExpenseCategoryAmount } from "@/features/finance/domain/finance-summary";

export function ExpenseBreakdownBars({
  rows,
}: {
  rows: readonly FinanceExpenseCategoryAmount[];
}) {
  const maxMinor = Math.max(1, ...rows.map((r) => r.amountMinor));

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">Gider Dağılımı</h3>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.category} className="space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">{row.category}</span>
              <span className="font-medium tabular-nums">{formatTRY(row.amountMinor)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${Math.round((row.amountMinor / maxMinor) * 100)}%` }}
              />
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu dönemde kayıtlı gider yok.</p>
        ) : null}
      </div>
    </div>
  );
}
