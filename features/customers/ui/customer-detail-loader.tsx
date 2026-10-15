"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getCustomerDetailAction } from "@/features/customers/application/get-customer-detail-action";
import { CustomerDetailPanel } from "@/features/customers/ui/customer-detail-panel";
import { formatTRY } from "@/shared/utils/money";

import type { CustomerDetail } from "@/features/customers/application/get-customer-detail-action";
import type { CustomerOrdersResult } from "@/features/orders/application/list-customer-orders";
import type { OrderListItem } from "@/features/orders/application/list-orders";

interface CustomerDetailLoaderProps {
  readonly id: string;
  readonly mapsKey: string;
  /** Called after a successful delete, so the caller (grid Sheet) can close
   *  itself before the router.push in CustomerDetailPanel lands. */
  readonly onDeleted?: () => void;
}

/** Fetch outcome tagged with the id it belongs to, so a result from a stale
 *  fetch (or a freshly-changed id) is ignored when rendering. */
type LoadState =
  | { kind: "loading"; id: string }
  | { kind: "ok"; id: string; detail: CustomerDetail }
  | { kind: "error"; id: string; message: string };

/**
 * Client loader for the grid's detail Sheet: fetches the customer AND their
 * orders in one Server Action when the Sheet opens (see
 * get-customer-detail-action.ts — the orders used to be a second round trip
 * after the first render), then renders the shared <CustomerDetailPanel>.
 * Shows loading + error states inline.
 *
 * State carries its `id` so we never need a synchronous reset-to-loading
 * setState inside the effect — the render simply treats a state whose id
 * doesn't match the current prop as "still loading".
 */
export function CustomerDetailLoader({
  id,
  mapsKey,
  onDeleted,
}: CustomerDetailLoaderProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading", id });

  useEffect(() => {
    let active = true;
    void getCustomerDetailAction(id).then((result) => {
      if (!active) return;
      if (result.ok) setState({ kind: "ok", id, detail: result.value });
      else setState({ kind: "error", id, message: result.error.message });
    });
    return () => {
      active = false;
    };
  }, [id]);

  // A result for a previous id (or initial mount before the effect resolves)
  // renders as loading.
  if (state.id !== id || state.kind === "loading")
    return <p className="p-4 text-sm text-muted-foreground">Yükleniyor…</p>;
  if (state.kind === "error")
    return <p className="p-4 text-sm text-destructive">{state.message}</p>;
  return (
    <CustomerDetailPanel
      customer={state.detail.customer}
      mapsKey={mapsKey}
      ordersSlot={
        <SheetCustomerOrders
          customerId={state.detail.customer.id}
          result={state.detail.orders}
        />
      }
      {...(onDeleted ? { onDeleted } : {})}
    />
  );
}

/**
 * Inline orders list for the grid Sheet. The boundary rule (CLAUDE.md §2 /
 * ESLint `boundaries`) forbids customers/ui from importing orders/ui, so this
 * mirrors `features/orders/ui/customer-orders-list.tsx`'s markup while sourcing
 * only the action + the OrderListItem type from orders/application (the public
 * cross-feature surface). Keep the two in sync if the markup changes.
 */
function SheetCustomerOrders({
  customerId,
  result,
}: {
  customerId: string;
  /** null = the orders read failed (fetched together with the customer). */
  result: CustomerOrdersResult | null;
}) {
  if (!result)
    return <p className="text-sm text-destructive">Siparişler yüklenemedi.</p>;

  const { items, total } = result;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Siparişler ({total})</h3>
        <Link
          href={`/orders/new?customer=${customerId}`}
          className="text-xs underline-offset-2 hover:underline"
        >
          + Yeni sipariş
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Henüz sipariş yok.</p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-md border border-border">
            {items.map((o: OrderListItem) => (
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
          {total > items.length && (
            <p className="text-xs text-muted-foreground">
              {total} siparişten ilk {items.length} tanesi gösteriliyor.
            </p>
          )}
        </>
      )}
    </section>
  );
}
