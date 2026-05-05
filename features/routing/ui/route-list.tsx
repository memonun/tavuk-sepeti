/**
 * Ordered stop list — Server Component. Sequence-indexed when optimized;
 * scheduled order otherwise. Each row carries a "Teslim Edildi" inline
 * action that flips the order's status via transitionOrderAction.
 */
import Link from "next/link";

import { MarkDeliveredButton } from "@/features/routing/ui/mark-delivered-button";
import { formatTRY } from "@/shared/utils/money";
import { formatTRPhone } from "@/shared/utils/phone";

import type { DayOrder } from "@/features/routing/application/get-day-orders";
import type { RouteStop } from "@/features/routing/domain/route";

interface RouteListProps {
  /** Either optimized stops (numbered 1..N) or unoptimized day orders. */
  rows:
    | { kind: "optimized"; stops: readonly RouteStop[] }
    | { kind: "unoptimized"; orders: readonly DayOrder[] };
}

function formatDistance(meters: number | null): string {
  if (meters === null) return "—";
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  const rem = m - h * 60;
  return rem === 0 ? `${h} sa` : `${h} sa ${rem} dk`;
}

export function RouteList({ rows }: RouteListProps) {
  const items =
    rows.kind === "optimized"
      ? rows.stops.map((stop) => ({
          key: stop.order_id,
          sequence: stop.sequence,
          orderId: stop.order_id,
          orderNumber: stop.order_number,
          customerId: stop.customer_id,
          customerName: stop.customer_name,
          customerPhone: stop.customer_phone,
          notes: stop.delivery_notes,
          totalMinor: stop.total_minor,
          legDistance: stop.leg_distance_m,
          legDuration: stop.leg_duration_s,
        }))
      : rows.orders.map((order, idx) => ({
          key: order.order_id,
          sequence: idx + 1,
          orderId: order.order_id,
          orderNumber: order.order_number,
          customerId: order.customer_id,
          customerName: `${order.customer_first_name} ${order.customer_last_name}`,
          customerPhone: order.customer_phone,
          notes: order.delivery_notes,
          totalMinor: order.total_minor,
          legDistance: null,
          legDuration: null,
        }));

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
        Bu gün için onaylı sipariş yok.
      </div>
    );
  }

  return (
    <ol className="space-y-2">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex items-start gap-3 rounded-lg border bg-card p-3"
        >
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {item.sequence}
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <Link
                href={`/orders/${item.orderId}`}
                className="font-mono text-xs hover:underline"
              >
                {item.orderNumber}
              </Link>
              <Link
                href={`/customers/${item.customerId}`}
                className="text-sm font-medium hover:underline"
              >
                {item.customerName}
              </Link>
              <span className="font-mono text-xs text-muted-foreground">
                {formatTRPhone(item.customerPhone)}
              </span>
            </div>
            {item.notes ? (
              <p className="text-xs text-muted-foreground">{item.notes}</p>
            ) : null}
            {rows.kind === "optimized" ? (
              <p className="text-xs text-muted-foreground">
                {item.sequence === 1 ? "Depodan" : "Önceki duraktan"}: {" "}
                {formatDistance(item.legDistance)} · {formatDuration(item.legDuration)}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <p className="font-mono text-sm">{formatTRY(item.totalMinor)}</p>
            <MarkDeliveredButton orderId={item.orderId} />
          </div>
        </li>
      ))}
    </ol>
  );
}
