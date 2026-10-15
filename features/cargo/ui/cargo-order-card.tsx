/**
 * Phone layout of the /kargo lists (prep queue and shipped history). Below the
 * `md` breakpoint a 7-column table only scrolls sideways, so each order becomes
 * a card: the same fields and the same actions, stacked. From `md` up the
 * tables are shown unchanged. Same card look as the Finans phone lists
 * (features/finance/ui/finance-phone-list.tsx) — kept local because UI is not
 * shared across features (CLAUDE.md §2).
 */
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/shared/utils/date";
import { formatTRY } from "@/shared/utils/money";
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_VARIANT,
} from "@/features/cargo/ui/cargo-payment-status";

import type { OrderListItem } from "@/features/orders/application/list-orders";

export function CargoOrderCard({
  order,
  actions,
}: {
  order: OrderListItem;
  /** Row actions, shown in the card's footer next to the payment status. */
  actions: React.ReactNode;
}) {
  return (
    <li className="rounded-2xl border bg-card shadow-(--admin-shadow-sm)">
      <div className="flex flex-col gap-1 px-4 pt-3 pb-2.5">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={`/orders/${order.id}`}
            className="min-w-0 text-base leading-snug font-semibold [overflow-wrap:anywhere]"
          >
            {order.customer_name}
          </Link>
          <span className="shrink-0 text-base font-semibold tabular-nums">
            {formatTRY(order.total_minor)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {[order.order_number, formatDate(order.created_at)].join(", ")}
        </p>
        {order.cargo_carrier ? (
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {order.cargo_carrier}
            {order.cargo_tracking_number ? ` · ${order.cargo_tracking_number}` : ""}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t py-1 pr-1.5 pl-4">
        <Badge variant={PAYMENT_STATUS_VARIANT[order.payment_status]}>
          {PAYMENT_STATUS_LABEL[order.payment_status]}
        </Badge>
        <div className="flex flex-wrap items-center justify-end gap-1.5">{actions}</div>
      </div>
    </li>
  );
}
