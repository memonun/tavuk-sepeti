/**
 * Cargo prep queue table — a flat, unpaginated list (the queue is a small,
 * bounded "what's waiting" view, not a browsable archive like /orders).
 * Same Table primitives as features/customers/ui/customer-table.tsx, no
 * SortableHeader/pagination since the queue is already sorted oldest-first
 * by the application layer.
 */
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
import { MarkCargoShippedButton } from "@/features/cargo/ui/mark-cargo-shipped-button";

import type { OrderListItem, PaymentStatus } from "@/features/orders/application/list-orders";

/** Shared with cargo-shipped-order-table.tsx — same payment-status vocabulary
 *  for both the prep queue and the shipped-history view below it. */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Bekliyor",
  partial: "Kısmi",
  paid: "Ödendi",
  failed: "Başarısız",
  refunded: "İade",
};

export const PAYMENT_STATUS_VARIANT: Record<PaymentStatus, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  partial: "secondary",
  paid: "default",
  failed: "destructive",
  refunded: "destructive",
};

export function CargoOrderTable({ orders }: { orders: OrderListItem[] }) {
  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
        Hazırlanacak kargo siparişi yok.
      </div>
    );
  }

  return (
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
              <TableCell>
                <div className="flex items-center justify-end gap-1.5">
                  <MarkCargoShippedButton orderId={order.id} />
                  <Link
                    href={`/orders/${order.id}`}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                  >
                    Detay
                  </Link>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
