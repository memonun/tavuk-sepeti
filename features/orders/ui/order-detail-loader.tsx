"use client";

import { useEffect, useState } from "react";

import { getOrderByIdAction } from "@/features/orders/application/get-order-action";
import { listOrderEventsAction } from "@/features/orders/application/get-order-events-action";
import { OrderDetailPanel } from "@/features/orders/ui/order-detail-panel";

import type { Product } from "@/features/products/application/list-products";
import type { Order, OrderStatusEvent } from "@/features/orders/domain/order";

interface OrderDetailLoaderProps {
  readonly id: string;
  readonly products: Product[];
  readonly customerName: string;
}

/** Fetch outcome tagged with the id it belongs to, so a result from a stale
 *  fetch (or a freshly-changed id) is ignored when rendering. */
type LoadState =
  | { kind: "loading"; id: string }
  | { kind: "ok"; id: string; order: Order; events: OrderStatusEvent[] }
  | { kind: "error"; id: string; message: string };

/**
 * Client loader for the grid's detail Sheet: fetches a single order + its
 * status events in parallel via Server Actions when the Sheet opens, then
 * renders the shared <OrderDetailPanel>. Shows loading + error states inline.
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

  useEffect(() => {
    let active = true;
    void Promise.all([
      getOrderByIdAction(id),
      listOrderEventsAction(id),
    ]).then(([orderResult, eventsResult]) => {
      if (!active) return;
      if (!orderResult.ok) {
        setState({ kind: "error", id, message: orderResult.error.message });
        return;
      }
      // Events failing isn't fatal — render the panel with an empty timeline.
      setState({
        kind: "ok",
        id,
        order: orderResult.value,
        events: eventsResult.ok ? eventsResult.value : [],
      });
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
    <OrderDetailPanel
      order={state.order}
      products={products}
      customerName={customerName}
      events={state.events}
    />
  );
}
