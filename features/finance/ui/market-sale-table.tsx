/** Pazar Satışları table — same shape as expense-table.tsx. */
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDate } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";
import { MANUAL_PAYMENT_METHOD_LABELS } from "@/features/finance/domain/expense";
import { FinanceSortableHeader } from "@/features/finance/ui/finance-sortable-header";
import { MarketSaleRowActions } from "@/features/finance/ui/market-sale-row-actions";

import type { MarketSaleListItem } from "@/features/finance/domain/market-sale";
import type { MarketLocation } from "@/features/finance/domain/market-location";

interface ProductOption {
  key: string;
  display_name: string;
}

interface MarketSaleTableProps {
  items: MarketSaleListItem[];
  total: number;
  page: number;
  pageSize: number;
  basePath: string;
  query: URLSearchParams;
  locations: MarketLocation[];
  products: ProductOption[];
}

export function MarketSaleTable({
  items,
  total,
  page,
  pageSize,
  basePath,
  query,
  locations,
  products,
}: MarketSaleTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const buildPageHref = (nextPage: number) => {
    const next = new URLSearchParams(query.toString());
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    const search = next.toString();
    return search ? `${basePath}?${search}` : basePath;
  };

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
        Kayıtlı pazar satışı yok. Sağ üstten &quot;Pazar Satışı Ekle&quot; ile başlayabilirsin.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <FinanceSortableHeader
                  column="sale_date"
                  label="Tarih"
                  defaultOrder="desc"
                  defaultSort="sale_date"
                />
              </TableHead>
              <TableHead>Pazar / Lokasyon</TableHead>
              <TableHead className="hidden sm:table-cell">Ürün sayısı</TableHead>
              <TableHead className="text-right">
                <FinanceSortableHeader
                  column="total_amount_minor"
                  label="Toplam Tutar"
                  align="right"
                  defaultOrder="desc"
                  defaultSort="sale_date"
                />
              </TableHead>
              <TableHead className="hidden sm:table-cell">Ödeme Yöntemi</TableHead>
              <TableHead className="text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((sale) => (
              <TableRow key={sale.id}>
                <TableCell className="text-muted-foreground">{formatDate(sale.sale_date)}</TableCell>
                <TableCell className="font-medium">{sale.location_name}</TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {sale.item_count > 0 ? sale.item_count : "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatTRY(sale.total_amount_minor)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {MANUAL_PAYMENT_METHOD_LABELS[sale.payment_method]}
                </TableCell>
                <TableCell>
                  <MarketSaleRowActions listItem={sale} locations={locations} products={products} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          {from}-{to} / toplam {total}
        </p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={buildPageHref(page - 1)}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Önceki
            </Link>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Önceki
            </Button>
          )}
          <span>
            Sayfa {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={buildPageHref(page + 1)}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Sonraki
            </Link>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Sonraki
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
