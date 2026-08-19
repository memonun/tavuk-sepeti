/**
 * "Satış Kanallarına Göre Ciro" — Tailwind horizontal bars, Server Component,
 * no charting library (none is installed; per owner decision, adding one for
 * a five-category breakdown wasn't worth the client-bundle cost).
 */
import { formatTRY } from "@/shared/utils/money";

import type { FinanceChannelRevenue } from "@/features/finance/domain/finance-summary";

export function ChannelRevenueBars({ rows }: { rows: readonly FinanceChannelRevenue[] }) {
  const maxMinor = Math.max(1, ...rows.map((r) => r.revenueMinor));

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">Satış Kanallarına Göre Ciro</h3>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.channel} className="space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium tabular-nums">{formatTRY(row.revenueMinor)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round((row.revenueMinor / maxMinor) * 100)}%` }}
              />
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu dönemde kayıtlı ciro yok.</p>
        ) : null}
      </div>
    </div>
  );
}
