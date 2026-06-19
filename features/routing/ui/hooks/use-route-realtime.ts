"use client";

/**
 * Keep the routing view's per-stop content live. Subscribes to the tables the
 * route reads from and triggers a debounced Server Component refresh:
 *   - orders        — delivery notes, payment (amount_paid via trigger), status
 *   - order_items   — line items / quantities / products
 *   - customers     — customer notes
 *   - addresses     — the LIVE primary-address coords the route's pin + legs use
 *                     (find_orders_for_route joins addresses; an address edit
 *                     must refresh the geometry, so it can't be omitted)
 *
 * Why a refresh is cheap: route geometry is memoized by stop coordinates in
 * callGoogleDirections, so a content-only change re-uses the cached optimize
 * result — no Google call, no reshuffle. Only a coordinate change busts it
 * (which is exactly when an `addresses` event should re-optimize).
 *
 * `reconcileOnLocalWrite` is false: driver-mode calls router.refresh() itself
 * after a delivery/revert, so markLocalWrite here only arms the self-write
 * cooldown to suppress the echo.
 *
 * order_items is published by migration 20260612190000; orders/customers/
 * addresses are already in the supabase_realtime publication.
 */
import {
  useTableRealtime,
  type UseTableRealtimeResult,
} from "@/shared/realtime/use-table-realtime";

const ROUTE_TABLES = ["orders", "order_items", "customers", "addresses"] as const;

export interface UseRouteRealtimeOptions {
  readonly debounceMs?: number;
  readonly enabled?: boolean;
}

export function useRouteRealtime(
  opts: UseRouteRealtimeOptions = {},
): UseTableRealtimeResult {
  return useTableRealtime({
    tables: ROUTE_TABLES,
    channelPrefix: "route-live",
    ...(opts.debounceMs !== undefined ? { debounceMs: opts.debounceMs } : {}),
    ...(opts.enabled !== undefined ? { enabled: opts.enabled } : {}),
    reconcileOnLocalWrite: false,
  });
}
