/**
 * Ürün Çetelesi — sold vs. gifted quantities per product for the page's
 * period. Server Component, no interactivity of its own (the period filter
 * is FinancePeriodFilter, shared with the rest of Finans).
 */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { ProductTallyRow, ProductTallyUnitQuantity } from "@/features/finance/domain/product-tally";

function formatQuantity(q: ProductTallyUnitQuantity): string {
  const value = Number.isInteger(q.quantity) ? q.quantity : q.quantity.toFixed(2);
  return `${value} ${q.unit_label}`;
}

export function ProductTallyTable({ rows }: { rows: readonly ProductTallyRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
        Bu dönemde satış veya hediye kaydı yok.
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ürün</TableHead>
            <TableHead className="text-right">Satılan</TableHead>
            <TableHead className="text-right">Hediye Edilen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.product_key}>
              <TableCell className="font-medium">{row.display_name}</TableCell>
              <TableCell className="text-right tabular-nums">
                {row.sold ? formatQuantity(row.sold) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.gifted.length > 0 ? (
                  <div className="flex flex-col items-end">
                    {row.gifted.map((g) => (
                      <span key={g.unit_label}>{formatQuantity(g)}</span>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
