"use client";

/**
 * Subscribe to live `orders` + `order_status_events` changes via Supabase
 * Realtime and trigger a Server Component refresh when something external
 * touches the grid.
 *
 * Strategy: brute-force `router.refresh()` on any change, debounced so a
 * bulk status sweep (many events in <1s) collapses to a single refetch.
 * Optimistic patches in the grid (useOptimisticRows) still win over the
 * refetch because their revision counter is monotonic — a freshly-fetched
 * row gets replaced by the in-flight patch on the next render, not the
 * other way around.
 *
 * Why brute-force: server-pushed delta merging into a paginated grid is a
 * real correctness puzzle (insert into a sorted+filtered page, delete
 * affecting pagination boundaries, RLS-changed rows). The refresh-everything
 * approach keeps the data flow honest and bumps to delta merging only become
 * worthwhile when the refresh cost itself becomes visible.
 *
 * Self-mutations also trigger this — that's acceptable: the optimistic UI is
 * already correct, and the refresh just confirms what the user already sees.
 * A `presence`-based self-filter is Faz 2 polish.
 */
import { useRouter } from "next/navigation";
import { useEffect, useId } from "react";

import { createSupabaseBrowserClient } from "@/shared/supabase/browser";

export interface UseOrdersRealtimeOptions {
  /**
   * Coalesce window for events. Defaults to 800ms — long enough that a
   * burst of status events fires one refresh, short enough that single
   * edits by another admin land within a second on this screen.
   */
  readonly debounceMs?: number;
  /**
   * Disable the subscription (e.g., for unit tests or when the user is
   * offline). The hook still mounts so callers don't need to conditionally
   * invoke it.
   */
  readonly enabled?: boolean;
}

export function useOrdersRealtime(
  opts: UseOrdersRealtimeOptions = {},
): void {
  const router = useRouter();
  const instanceId = useId();
  const debounceMs = opts.debounceMs ?? 800;
  const enabled = opts.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    const supabase = createSupabaseBrowserClient();
    let pending: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (pending) return; // already coalescing
      pending = setTimeout(() => {
        pending = null;
        router.refresh();
      }, debounceMs);
    };

    // Per-instance channel name. supabase-js doesn't de-dupe by name, so if
    // two OrderGrid components ever mount simultaneously the cleanup paths
    // would race on a shared channel.
    const channel = supabase
      .channel(`orders-grid:${instanceId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "orders" },
        scheduleRefresh,
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "order_status_events" },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (pending) clearTimeout(pending);
      void supabase.removeChannel(channel);
    };
  }, [router, debounceMs, enabled, instanceId]);
}
