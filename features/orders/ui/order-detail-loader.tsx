"use client";

import { useEffect, useState } from "react";

import { getOrderDetailAction } from "@/features/orders/application/get-order-detail-action";
import { OrderDetailPanel } from "@/features/orders/ui/order-detail-panel";

import type { OrderDetail } from "@/features/orders/application/get-order-detail-action";
import type { Product } from "@/features/products/application/list-products";

interface OrderDetailLoaderProps {
  readonly id: string;
  readonly products: Product[];
  readonly customerName: string;
}

/** Fetch outcome tagged with the id it belongs to, so a result from a stale
 *  fetch (or a freshly-changed id) is ignored when rendering. */
type LoadState =
  | { kind: "loading"; id: string }
  | { kind: "ok"; id: string; detail: OrderDetail }
  | { kind: "error"; id: string; message: string };

/**
 * Client loader for the grid's detail Sheet: fetches the order, its status
 * events, payments, gifts and the customer's special prices in ONE Server
 * Action when the Sheet opens (see get-order-detail-action.ts — Next runs a
 * client's actions one at a time, so separate calls were sequential round
 * trips), then renders the shared <OrderDetailPanel>. Shows loading + error
 * states inline.
 *
 * State carries its `id` so we never need a synchronous reset-to-loading
 * setState inside the effect — the render simply treats a state whose id
 * doesn't match the current prop as "still loading" (CLAUDE.md / the
 * set-state-in-effect lint rule).
 */
export function OrderDetailLoader({
  id,
  products,
  customerName,
}: OrderDetailLoaderProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading", id });
  // Bumping this re-runs the fetch so a child mutation (e.g. recording a
  // payment) refreshes the Sheet WITHOUT a full page reload — router.refresh()
  // alone can't re-run this client effect. General pattern for detail loaders.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void getOrderDetailAction(id).then((result) => {
      if (!active) return;
      if (result.ok) setState({ kind: "ok", id, detail: result.value });
      else setState({ kind: "error", id, message: result.error.message });
    });
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  // A result for a previous id (or initial mount before the effect resolves)
  // renders as loading.
  if (state.id !== id || state.kind === "loading")
    return <p className="p-4 text-sm text-muted-foreground">Yükleniyor…</p>;
  if (state.kind === "error")
    return <p className="p-4 text-sm text-destructive">{state.message}</p>;

  return (
    <OrderDetailPanel
      order={state.detail.order}
      products={products}
      customerName={customerName}
      events={state.detail.events}
      payments={state.detail.payments}
      gifts={state.detail.gifts}
      customerPrices={state.detail.customerPrices}
      onMutated={() => setReloadKey((k) => k + 1)}
    />
  );
}
