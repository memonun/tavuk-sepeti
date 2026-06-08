"use client";

import { useEffect, useState } from "react";

import { getCustomerByIdAction } from "@/features/customers/application/get-customer-action";
import { CustomerDetailPanel } from "@/features/customers/ui/customer-detail-panel";

import type { Customer } from "@/features/customers/domain/customer";

interface CustomerDetailLoaderProps {
  readonly id: string;
  readonly mapsKey: string;
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
export function CustomerDetailLoader({ id, mapsKey }: CustomerDetailLoaderProps) {
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
  return <CustomerDetailPanel customer={state.customer} mapsKey={mapsKey} />;
}
