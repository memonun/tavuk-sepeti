"use client";

/**
 * Phone layout for the orders list: one card per order instead of the
 * spreadsheet grid, which needs a mouse and a wide screen. Same rows, same
 * filters, same detail panel on tap — only the presentation differs. The grid
 * itself is still reachable through the view toggle next to the search box.
 */
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FULFILLMENT_CHANNEL_LABELS,
  type OrderListItem,
} from "@/features/orders/domain/order";
import { TIME_SLOT_OPTIONS } from "@/features/orders/ui/order-grid-columns";
import { getOrderRowBackground } from "@/features/orders/ui/order-row-color";
import { orderStatusEditor } from "@/features/orders/ui/order-status-cell";
import { PaymentStatusCell } from "@/features/orders/ui/payment-status-cell";
import { formatDate } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";

/** The list can hold up to GRID_PAGE_SIZE rows; cards are revealed in steps so
 *  a phone never has to lay out thousands of them at once. */
const STEP = 40;

function timeSlotLabel(slot: OrderListItem["time_slot"]): string | null {
  if (slot === null) return null;
  return TIME_SLOT_OPTIONS.find((option) => option.value === slot)?.label ?? null;
}

export function OrderCardList({
  items,
  onOpen,
}: {
  readonly items: readonly OrderListItem[];
  readonly onOpen: (order: OrderListItem) => void;
}) {
  const [visible, setVisible] = useState(STEP);

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-base text-muted-foreground">
        Bu filtrelere uyan sipariş yok.
      </p>
    );
  }

  const shown = items.slice(0, visible);
  const remaining = items.length - shown.length;

  return (
    <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2">
      <ul className="flex flex-col gap-2.5">
        {shown.map((order) => {
          const name = order.customer_name?.trim();
          const slot = timeSlotLabel(order.time_slot);
          return (
            <li
              key={order.id}
              className="overflow-hidden rounded-2xl border bg-card shadow-(--admin-shadow-sm)"
            >
              <button
                type="button"
                onClick={() => onOpen(order)}
                className="admin-menu-row flex w-full flex-col gap-1 px-4 pt-3 pb-2.5 text-left"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-base leading-snug font-semibold [overflow-wrap:anywhere]">
                    {name && name.length > 0 ? name : "(isimsiz)"}
                  </span>
                  <span className="shrink-0 text-base font-semibold tabular-nums">
                    {formatTRY(order.total_minor)}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  <span>
                    {formatDate(order.scheduled_for)}
                    {slot ? `, ${slot}` : ""}
                  </span>
                  <span className="font-mono text-xs">{order.order_number}</span>
                </span>
                {order.delivery_notes ? (
                  <span className="line-clamp-2 text-sm">{order.delivery_notes}</span>
                ) : null}
              </button>
              <div
                className="flex flex-wrap items-center gap-2 border-t px-4 py-2"
                style={{ backgroundColor: getOrderRowBackground(order) }}
              >
                {orderStatusEditor.render(order.status)}
                <Badge variant={order.fulfillment_channel === "shipping" ? "outline" : "secondary"}>
                  {FULFILLMENT_CHANNEL_LABELS[order.fulfillment_channel]}
                </Badge>
                {order.source === "recurring_generated" ? (
                  <Badge variant="outline">Abonelik</Badge>
                ) : null}
                <div className="ml-auto px-2 py-1">
                  <PaymentStatusCell order={order} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {remaining > 0 ? (
        <Button
          type="button"
          variant="outline"
          className="mt-3 w-full"
          onClick={() => setVisible((count) => count + STEP)}
        >
          {Math.min(STEP, remaining)} sipariş daha göster ({remaining} kaldı)
        </Button>
      ) : null}
    </div>
  );
}
