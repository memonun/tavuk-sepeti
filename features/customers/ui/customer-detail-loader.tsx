"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getCustomerByIdAction } from "@/features/customers/application/get-customer-action";
import { CustomerDetailPanel } from "@/features/customers/ui/customer-detail-panel";
import { listCustomerOrdersAction } from "@/features/orders/application/list-customer-orders";
import { formatTRY } from "@/shared/utils/money";

import type { Customer } from "@/features/customers/domain/customer";
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
  | { kind: "ok"; id: string; customer: Customer }
  | { kind: "error"; id: string; message: string };

/**
 * Client loader for the grid's detail Sheet: fetches a single customer via
 * the Server Action when the Sheet opens, then renders the shared
 * <CustomerDetailPanel>. Shows loading + error states inline.
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
    void getCustomerByIdAction(id).then((result) => {
      if (!active) return;
      if (result.ok)
        setState({ kind: "ok", id, customer: result.value });
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
      customer={state.customer}
      mapsKey={mapsKey}
      ordersSlot={<SheetCustomerOrders customerId={state.customer.id} />}
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
function SheetCustomerOrders({ customerId }: { customerId: string }) {
  const [result, setResult] = useState<CustomerOrdersResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listCustomerOrdersAction(customerId).then((r) => {
      if (!active) return;
      if (r.ok) setResult(r.value);
      else setError(r.error.message);
    });
    return () => {
      active = false;
    };
  }, [customerId]);

  if (error)
    return <p className="text-sm text-destructive">Siparişler yüklenemedi.</p>;
  if (!result)
    return <p className="text-sm text-muted-foreground">Yükleniyor…</p>;

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
