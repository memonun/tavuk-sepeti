/**
 * Ürün Çetelesi — sold vs. gifted quantities per product for the page's
 * period. Server Component, no interactivity of its own (the period filter
 * is FinancePeriodFilter, shared with the rest of Finans).
 */
import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  parsePiecesPerUnit,
  type ProductTallyRow,
  type ProductTallyUnitQuantity,
} from "@/features/finance/domain/product-tally";

function formatQuantity(q: ProductTallyUnitQuantity): string {
  const value = Number.isInteger(q.quantity) ? q.quantity : q.quantity.toFixed(2);
  return `${value} ${q.unit_label}`;
}

/** Sold-only: "240 paket (15 adet)" → "240 paket (15 adet) = 3.600 adet". */
function formatSoldQuantity(sold: ProductTallyUnitQuantity): string {
  const base = formatQuantity(sold);
  const pieces = parsePiecesPerUnit(sold.unit_label);
  if (!pieces) return base;
  return `${base} = ${(sold.quantity * pieces).toLocaleString("tr-TR")} adet`;
}

interface ProductTallyTableProps {
  rows: readonly ProductTallyRow[];
  /** Product whose orders are open below the table, if any. */
  selectedKey?: string | undefined;
  /** Link that opens a product's order list (keeps the period in the URL). */
  hrefForProduct: (row: ProductTallyRow) => string;
}

export function ProductTallyTable({ rows, selectedKey, hrefForProduct }: ProductTallyTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
        Bu dönemde satış veya hediye kaydı yok.
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <p className="border-b bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        Ürün adına basarak o ürünün satıldığı siparişleri aşağıda görün.
      </p>
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
            <TableRow
              key={row.product_key}
              data-state={row.product_key === selectedKey ? "selected" : undefined}
            >
              <TableCell className="font-medium">
                <Link
                  href={hrefForProduct(row)}
                  aria-label={`${row.display_name} siparişlerini göster`}
                  className={cn(
                    "underline-offset-4 hover:underline",
                    row.product_key === selectedKey && "text-primary underline",
                  )}
                >
                  {row.display_name}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.sold ? formatSoldQuantity(row.sold) : "—"}
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
