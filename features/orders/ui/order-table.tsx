import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ClickableTableRow } from "@/components/clickable-table-row";
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

import type {
  OrderListItem,
  OrderStatus,
  PaymentStatus,
  TimeSlot,
} from "@/features/orders/domain/order";

interface OrderTableProps {
  items: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
  basePath: string;
  query: URLSearchParams;
}

const STATUS_VARIANT: Record<OrderStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  confirmed: "default",
  delivered: "outline",
  cancelled: "destructive",
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Beklemede",
  confirmed: "Onaylı",
  delivered: "Teslim edildi",
  cancelled: "İptal",
};

const TIME_SLOT_LABEL: Record<TimeSlot, string> = {
  morning: "Sabah",
  afternoon: "Öğleden sonra",
  evening: "Akşam",
};

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: "Bekliyor",
  paid: "Ödendi",
  failed: "Başarısız",
  refunded: "İade",
};

export function OrderTable({
  items,
  total,
  page,
  pageSize,
  basePath,
  query,
}: OrderTableProps) {
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
        Sipariş yok. Filtreyi değiştirebilir veya yeni sipariş oluşturabilirsin.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No</TableHead>
              <TableHead>Müşteri</TableHead>
              <TableHead className="hidden sm:table-cell">Teslim</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="hidden md:table-cell">Ödeme</TableHead>
              <TableHead className="text-right">Tutar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((o) => (
              <ClickableTableRow key={o.id} href={`/orders/${o.id}`}>
                <TableCell className="font-mono text-xs">
                  {o.order_number}
                </TableCell>
                <TableCell>
                  {/* Inner link wins click — ClickableTableRow detects the
                      anchor and lets the browser navigate to the customer
                      instead of the order detail. */}
                  <Link
                    href={`/customers/${o.customer_id}`}
                    className="hover:underline"
                  >
                    {o.customer_name}
                  </Link>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">
                  {formatDate(o.scheduled_for)}
                  {o.time_slot ? (
                    <span className="ml-1 text-xs">
                      · {TIME_SLOT_LABEL[o.time_slot]}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[o.status]}>
                    {STATUS_LABEL[o.status]}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {PAYMENT_LABEL[o.payment_status]}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatTRY(o.total_minor)}
                </TableCell>
              </ClickableTableRow>
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
