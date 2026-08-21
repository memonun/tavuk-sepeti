/**
 * Shipped-cargo history — a paginated, read-only archive of shipping-channel
 * orders already marked "Kargolandı" (see mark-cargo-shipped-button.tsx),
 * sitting below the prep queue on /kargo. Unlike the queue (a small, bounded
 * "what's left to pack" list with no pagination), this is an unbounded,
 * growing archive, so it's paginated like any other browsable list
 * (CLAUDE.md §9) — same prev/next pattern as market-sale-table.tsx.
 */
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
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
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_VARIANT,
} from "@/features/cargo/ui/cargo-order-table";

import type { OrderListItem } from "@/features/orders/application/list-orders";

export function CargoShippedOrderTable({
  orders,
  total,
  page,
  pageSize,
}: {
  orders: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const buildPageHref = (nextPage: number) =>
    nextPage <= 1 ? "/kargo" : `/kargo?page=${nextPage}`;

  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
        Henüz kargoya verilmiş sipariş yok.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sipariş No</TableHead>
              <TableHead>Müşteri</TableHead>
              <TableHead className="hidden sm:table-cell">Tarih</TableHead>
              <TableHead className="text-right">Tutar</TableHead>
              <TableHead>Ödeme</TableHead>
              <TableHead className="hidden lg:table-cell">Kargo Bilgisi</TableHead>
              <TableHead className="text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">
                  <Link href={`/orders/${order.id}`} className="hover:underline">
                    {order.order_number}
                  </Link>
                </TableCell>
                <TableCell>{order.customer_name}</TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {formatDate(order.created_at)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatTRY(order.total_minor)}
                </TableCell>
                <TableCell>
                  <Badge variant={PAYMENT_STATUS_VARIANT[order.payment_status]}>
                    {PAYMENT_STATUS_LABEL[order.payment_status]}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {order.cargo_carrier ? (
                    <span>
                      {order.cargo_carrier}
                      {order.cargo_tracking_number ? ` · ${order.cargo_tracking_number}` : ""}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/orders/${order.id}`}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                  >
                    Detay
                  </Link>
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
