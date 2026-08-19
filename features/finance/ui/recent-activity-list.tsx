/** "Son Finansal Hareketler" — plain-language feed, no DB terms. */
import { ArrowDownCircle, Receipt, Store } from "lucide-react";

import { formatDateTime } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";

import type { FinancialActivityItem } from "@/features/finance/domain/financial-activity";

const ICONS: Record<FinancialActivityItem["kind"], typeof ArrowDownCircle> = {
  order_payment: ArrowDownCircle,
  expense: Receipt,
  market_sale: Store,
};

export function RecentActivityList({ items }: { items: readonly FinancialActivityItem[] }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">Son Finansal Hareketler</h3>
      <ul className="mt-3 divide-y">
        {items.map((item) => {
          const Icon = ICONS[item.kind];
          return (
            <li key={item.id} className="flex items-center gap-3 py-2.5 text-sm">
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate">{item.description}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(item.occurredAt)}</p>
              </div>
              <span className="shrink-0 font-medium tabular-nums">
                {formatTRY(item.amountMinor)}
              </span>
            </li>
          );
        })}
        {items.length === 0 ? (
          <li className="py-6 text-center text-sm text-muted-foreground">
            Henüz bir hareket yok.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
