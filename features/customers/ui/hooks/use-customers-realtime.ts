"use client";

/**
 * Subscribe to live `customers` + `addresses` changes via Supabase
 * Realtime and trigger a Server Component refresh when something
 * external touches the grid.
 *
 * Strategy: brute-force `router.refresh()` on any change, debounced so
 * a bulk paste (100 rows = 100 events in <1s) collapses to a single
 * refetch. Optimistic patches in the grid (useOptimisticRows) still
 * win over the refetch because their revision counter is monotonic —
 * a freshly-fetched row gets replaced by the in-flight patch on the
 * next render, not the other way around.
 *
 * Why brute-force: server-pushed delta merging into a paginated grid
 * is a real correctness puzzle (insert into a sorted+filtered page,
 * delete affecting pagination boundaries, RLS-changed rows). The
 * refresh-everything approach keeps the data flow honest and bumps
 * to delta merging only become worthwhile when the refresh cost
 * itself becomes visible.
 *
 * Self-write cooldown: inline cell edits are optimistic + persist without
 * revalidatePath, so the grid is already correct. Callers signal a local write
 * via the returned `markLocalWrite()`; for SELF_WRITE_COOLDOWN_MS after that we
 * defer the confirming refresh (trailing-debounced) so an editing/paste burst
 * isn't disrupted by a mid-action full-table refetch, then reconcile once the
 * user pauses. External (peer) edits still land promptly.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef } from "react";

import { createSupabaseBrowserClient } from "@/shared/supabase/browser";

const SELF_WRITE_COOLDOWN_MS = 1500;

export interface UseCustomersRealtimeOptions {
  /**
   * Coalesce window for events. Defaults to 800ms — long enough that
   * a 100-row paste fires one refresh, short enough that single edits
   * by another admin land within a second on this screen.
   */
  readonly debounceMs?: number;
  /**
   * Disable the subscription (e.g., for unit tests or when the user
   * is offline). The hook still mounts so callers don't need to
   * conditionally invoke it.
   */
  readonly enabled?: boolean;
}

export interface UseCustomersRealtimeResult {
  /**
   * Signal a local write; suppresses the next ~SELF_WRITE_COOLDOWN_MS of
   * confirming refreshes (trailing-debounced) so an edit/paste burst isn't
   * interrupted, then reconciles once the user pauses.
   */
  readonly markLocalWrite: () => void;
}

export function useCustomersRealtime(
  opts: UseCustomersRealtimeOptions = {},
): UseCustomersRealtimeResult {
  const router = useRouter();
  const instanceId = useId();
  const debounceMs = opts.debounceMs ?? 800;
  const enabled = opts.enabled ?? true;

  const lastLocalWrite = useRef(0);
  const scheduleRefreshRef = useRef<(() => void) | null>(null);

  const markLocalWrite = useCallback(() => {
    lastLocalWrite.current = Date.now();
    // Reconcile even with no Realtime echo; if the subscription is disabled,
    // refresh directly (revalidatePath was removed from the cell action).
    if (scheduleRefreshRef.current) scheduleRefreshRef.current();
    else router.refresh();
  }, [router]);

  useEffect(() => {
    if (!enabled) return;
    const supabase = createSupabaseBrowserClient();
    let pending: ReturnType<typeof setTimeout> | null = null;

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

    // Per-instance channel name. supabase-js doesn't de-dupe by name,
    // so if two CustomerGrid components ever mount simultaneously the
    // cleanup paths would race on a shared channel.
    const channel = supabase
      .channel(`customers-grid:${instanceId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "customers" },
        scheduleRefresh,
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "addresses" },
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
