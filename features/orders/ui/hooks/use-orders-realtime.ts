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
 * Self-write cooldown: inline cell edits are optimistic + persist without
 * revalidatePath, so the grid is already correct. Callers signal a local write
 * via the returned `markLocalWrite()`; for SELF_WRITE_COOLDOWN_MS after that we
 * defer the confirming refresh (trailing-debounced) so the user's editing burst
 * isn't disrupted by a mid-action full-table refetch. The deferred refresh then
 * reconciles `base` once they pause. External (peer) edits still land promptly.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef } from "react";

import { createSupabaseBrowserClient } from "@/shared/supabase/browser";

const SELF_WRITE_COOLDOWN_MS = 1500;

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

export interface UseOrdersRealtimeResult {
  /**
   * Signal that the local user just committed a write. Suppresses the next
   * ~SELF_WRITE_COOLDOWN_MS of confirming refreshes (trailing-debounced) so the
   * user's edit burst isn't interrupted, then reconciles once they pause.
   */
  readonly markLocalWrite: () => void;
}

export function useOrdersRealtime(
  opts: UseOrdersRealtimeOptions = {},
): UseOrdersRealtimeResult {
  const router = useRouter();
  const instanceId = useId();
  const debounceMs = opts.debounceMs ?? 800;
  const enabled = opts.enabled ?? true;

  const lastLocalWrite = useRef(0);
  const scheduleRefreshRef = useRef<(() => void) | null>(null);

  const markLocalWrite = useCallback(() => {
    lastLocalWrite.current = Date.now();
    // Schedule the deferred reconcile even if Realtime never echoes the write.
    scheduleRefreshRef.current?.();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const supabase = createSupabaseBrowserClient();
    let pending: ReturnType<typeof setTimeout> | null = null;

    // Trailing debounce. Within the self-write cooldown we use the longer
    // cooldown delay (defer past the user's editing burst); otherwise the
    // normal coalesce window so peer edits land promptly.
    const scheduleRefresh = () => {
      const sinceLocal = Date.now() - lastLocalWrite.current;
      const delay = sinceLocal < SELF_WRITE_COOLDOWN_MS ? SELF_WRITE_COOLDOWN_MS : debounceMs;
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        router.refresh();
      }, delay);
    };
    scheduleRefreshRef.current = scheduleRefresh;

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
      scheduleRefreshRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [router, debounceMs, enabled, instanceId]);

  return { markLocalWrite };
}
