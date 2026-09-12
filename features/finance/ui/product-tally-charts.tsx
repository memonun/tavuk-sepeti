/**
 * Ürün Çetelesi charts — Server Component, same Tailwind horizontal-bar
 * treatment as ChannelRevenueBars/ExpenseBreakdownBars (no charting library
 * in this codebase, by owner decision — see channel-revenue-bars.tsx).
 *
 * Sold and gifted quantities are grouped by unit_label BEFORE charting
 * (features/finance/domain/product-tally.ts's groupSoldByUnit/
 * groupGiftedByUnit) — a bar's length only means something when every bar
 * in the chart shares one unit, and this report's products span kg, adet,
 * litre, kavanoz, gr… A product sold in "kg" and another sold in "adet"
 * never share an axis; each unit gets its own ranked mini bar-list instead.
 */
import { cn } from "@/lib/utils";
import {
  groupGiftedByUnit,
  groupSoldByUnit,
  type ProductTallyChartGroup,
  type ProductTallyRow,
} from "@/features/finance/domain/product-tally";

function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2);
}

function UnitBarGroup({
  group,
  barClassName,
}: {
  group: ProductTallyChartGroup;
  barClassName: string;
}) {
  const maxQuantity = Math.max(1, ...group.rows.map((r) => r.quantity));

  return (
    <div className="rounded-lg border bg-card p-4">
      <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {group.unit_label}
      </h4>
      <div className="mt-3 space-y-3">
        {group.rows.map((row) => (
          <div key={row.product_key} className="space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">{row.display_name}</span>
              <span className="font-medium tabular-nums">
                {formatQuantity(row.quantity)} {group.unit_label}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", barClassName)}
                style={{ width: `${Math.round((row.quantity / maxQuantity) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductTallyCharts({ rows }: { rows: readonly ProductTallyRow[] }) {
  const soldGroups = groupSoldByUnit(rows);
  const giftGroups = groupGiftedByUnit(rows);

  if (soldGroups.length === 0 && giftGroups.length === 0) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Satılan Ürünler</h3>
        {soldGroups.length > 0 ? (
          soldGroups.map((group) => (
            <UnitBarGroup key={group.unit_label} group={group} barClassName="bg-primary" />
          ))
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
            Bu dönemde satış yok.
          </div>
        )}
      </div>
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Hediye Edilen Ürünler</h3>
        {giftGroups.length > 0 ? (
          giftGroups.map((group) => (
            <UnitBarGroup key={group.unit_label} group={group} barClassName="bg-amber-500" />
          ))
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
            Bu dönemde hediye yok.
          </div>
        )}
      </div>
    </div>
  );
}
