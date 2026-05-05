/**
 * Order detail — Server Component composition.
 *
 * Three regions:
 *   1. Header: order number, status badge, customer link, action bar.
 *   2. Items + pricing summary.
 *   3. Status timeline (audit log of order_status_events).
 */
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { OrderStatusActions } from "@/features/orders/ui/order-status-actions";
import { formatDate, formatDateTime } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";

import type {
  Order,
  OrderStatus,
  OrderStatusEvent,
  PaymentStatus,
  TimeSlot,
} from "@/features/orders/domain/order";

interface OrderDetailProps {
  order: Order;
  events: OrderStatusEvent[];
  customerName: string;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Beklemede",
  confirmed: "Onaylı",
  delivered: "Teslim edildi",
  cancelled: "İptal",
};

const STATUS_VARIANT: Record<OrderStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  confirmed: "default",
  delivered: "outline",
  cancelled: "destructive",
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

export function OrderDetail({ order, events, customerName }: OrderDetailProps) {
  const snapshot = order.delivery_address_snapshot;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            <Link href="/orders" className="hover:underline">
              ← Siparişler
            </Link>
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">
            {order.order_number}
          </h2>
          <p className="text-sm">
            <Link
              href={`/customers/${order.customer_id}`}
              className="hover:underline"
            >
              {customerName}
            </Link>
            {" · "}
            {formatDate(order.scheduled_for)}
            {order.time_slot
              ? ` · ${TIME_SLOT_LABEL[order.time_slot]}`
              : null}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[order.status]} className="text-sm">
          {STATUS_LABEL[order.status]}
        </Badge>
      </header>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Ürünler</h3>
            <ul className="divide-y">
              {order.items.map((item) => (
                <li
                  key={item.id}
                  className="grid grid-cols-12 items-center gap-2 py-2 text-sm"
                >
                  <span className="col-span-6">
                    {item.product_snapshot.display_name}
                  </span>
                  <span className="col-span-3 text-muted-foreground">
                    {item.quantity} {item.product_snapshot.unit_label}
                  </span>
                  <span className="col-span-3 text-right font-mono">
                    {formatTRY(item.line_total_minor)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 grid grid-cols-2 gap-1 border-t pt-3 text-sm">
              <dt className="text-muted-foreground">Ara toplam</dt>
              <dd className="text-right font-mono">
                {formatTRY(order.subtotal_minor)}
              </dd>
              <dt className="text-muted-foreground">Teslimat</dt>
              <dd className="text-right font-mono">
                {formatTRY(order.delivery_fee_minor)}
              </dd>
              <dt className="font-medium">Toplam</dt>
              <dd className="text-right font-mono font-semibold">
                {formatTRY(order.total_minor)}
              </dd>
            </dl>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">Teslimat adresi</h3>
            <p className="text-sm">{snapshot.raw_text}</p>
            {snapshot.description ? (
              <p className="text-xs text-muted-foreground">
                {snapshot.description}
              </p>
            ) : null}
            {order.delivery_notes ? (
              <p className="mt-2 text-xs">
                <span className="font-medium">Not: </span>
                {order.delivery_notes}
              </p>
            ) : null}
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {snapshot.lat.toFixed(6)}, {snapshot.lng.toFixed(6)}
            </p>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Ödeme</h3>
            <dl className="grid grid-cols-2 gap-1 text-sm">
              <dt className="text-muted-foreground">Yöntem</dt>
              <dd className="text-right">
                {order.payment_method === "cash_on_delivery"
                  ? "Kapıda"
                  : "Havale"}
              </dd>
              <dt className="text-muted-foreground">Durum</dt>
              <dd className="text-right">
                {PAYMENT_LABEL[order.payment_status]}
              </dd>
            </dl>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Eylemler</h3>
            <OrderStatusActions
              orderId={order.id}
              currentStatus={order.status}
            />
          </div>
        </aside>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Durum geçmişi</h3>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Olay yok.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-start gap-3 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {formatDateTime(event.created_at)}
                </span>
                <div className="flex-1">
                  <p>
                    {event.from_status
                      ? `${STATUS_LABEL[event.from_status]} → `
                      : ""}
                    <span className="font-medium">
                      {STATUS_LABEL[event.to_status]}
                    </span>
                  </p>
                  {event.reason ? (
                    <p className="text-xs text-muted-foreground">
                      {event.reason}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
