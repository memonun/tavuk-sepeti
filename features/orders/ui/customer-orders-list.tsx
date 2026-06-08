"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { listCustomerOrdersAction } from "@/features/orders/application/list-customer-orders";
import { formatTRY } from "@/shared/utils/money";

import type { OrderListItem } from "@/features/orders/application/list-orders";

/**
 * Compact orders list for the customer-detail route page. Fetches via the
 * admin-gated Server Action on mount. The grid Sheet renders an equivalent
 * inline list in customers/ui (the boundary rule forbids importing this UI
 * across features), so keep the markup here in sync if it changes.
 */
export function CustomerOrdersList({ customerId }: { customerId: string }) {
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listCustomerOrdersAction(customerId).then((r) => {
      if (!active) return;
      if (r.ok) setOrders(r.value);
      else setError(r.error.message);
    });
    return () => {
      active = false;
    };
  }, [customerId]);

  if (error)
    return <p className="text-sm text-destructive">Siparişler yüklenemedi.</p>;
  if (!orders)
    return <p className="text-sm text-muted-foreground">Yükleniyor…</p>;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Siparişler ({orders.length})</h3>
        <Link
          href={`/orders/new?customer=${customerId}`}
          className="text-xs underline-offset-2 hover:underline"
        >
          + Yeni sipariş
        </Link>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Henüz sipariş yok.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {orders.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <Link
                href={`/orders/${o.id}`}
                className="font-mono text-xs underline-offset-2 hover:underline"
              >
                {o.order_number}
              </Link>
              <span className="text-muted-foreground">{o.scheduled_for}</span>
              <span>{o.status}</span>
              <span className="font-mono">{formatTRY(o.total_minor)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
