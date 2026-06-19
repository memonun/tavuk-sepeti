"use client";

/**
 * Shared Supabase Realtime → Server-Component-refresh primitive.
 *
 * Subscribes to `postgres_changes` on the given tables and triggers a
 * trailing-debounced `router.refresh()` when something external touches them.
 * Extracted from the customers/orders grid hooks (CLAUDE.md §2: shared concepts
 * live in shared/) so callers differ only in their table list + options.
 *
 * Self-write cooldown: a caller signals a local write via `markLocalWrite()`;
 * for SELF_WRITE_COOLDOWN_MS after that, the confirming refresh is deferred
 * (trailing-debounced) so the user's own edit burst isn't interrupted. External
 * (peer) edits still land within `debounceMs`.
 *
 * `reconcileOnLocalWrite`: when true (grids whose inline edits skip
 * revalidatePath), `markLocalWrite()` also schedules the deferred reconcile so
 * the screen still refetches. When false (callers that refresh themselves after
 * their own mutation, e.g. driver mode), it only records the cooldown stamp.
 *
 * postgres_changes is RLS-aware; a non-admin subscriber gets an empty stream.
 * Each subscribed table must be in the `supabase_realtime` publication.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef } from "react";

import { createSupabaseBrowserClient } from "@/shared/supabase/browser";

const SELF_WRITE_COOLDOWN_MS = 1500;

export interface UseTableRealtimeOptions {
  /** Tables to subscribe to (must be in the supabase_realtime publication). */
  readonly tables: readonly string[];
  /** Channel-name prefix; a per-instance id is appended to avoid races. */
  readonly channelPrefix: string;
  /** Coalesce window for external events. Defaults to 800ms. */
  readonly debounceMs?: number;
  /** Disable the subscription (still returns a stable markLocalWrite). */
  readonly enabled?: boolean;
  /** Whether markLocalWrite also schedules a deferred reconcile. Default false. */
  readonly reconcileOnLocalWrite?: boolean;
}

export interface UseTableRealtimeResult {
  readonly markLocalWrite: () => void;
}

export function useTableRealtime(
  opts: UseTableRealtimeOptions,
): UseTableRealtimeResult {
  const router = useRouter();
  const instanceId = useId();
  const debounceMs = opts.debounceMs ?? 800;
  const enabled = opts.enabled ?? true;
  const reconcileOnLocalWrite = opts.reconcileOnLocalWrite ?? false;
  // Stable key for the effect dep — the array identity would churn every render.
  const tablesKey = opts.tables.join(",");

  const lastLocalWrite = useRef(0);
  const scheduleRefreshRef = useRef<(() => void) | null>(null);

  const markLocalWrite = useCallback(() => {
    lastLocalWrite.current = Date.now();
    if (!reconcileOnLocalWrite) return;
    // Caller's mutation doesn't refresh on its own — ensure a reconcile lands
    // even if Realtime never echoes the write.
    if (scheduleRefreshRef.current) scheduleRefreshRef.current();
    else router.refresh();
  }, [router, reconcileOnLocalWrite]);

  useEffect(() => {
    if (!enabled) return;
    const supabase = createSupabaseBrowserClient();
    let pending: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      const sinceLocal = Date.now() - lastLocalWrite.current;
      const delay =
        sinceLocal < SELF_WRITE_COOLDOWN_MS ? SELF_WRITE_COOLDOWN_MS : debounceMs;
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        router.refresh();
      }, delay);
    };
    scheduleRefreshRef.current = scheduleRefresh;

    const tables = tablesKey.split(",");
    let channel = supabase.channel(`${opts.channelPrefix}:${instanceId}`);
    for (const table of tables) {
      channel = channel.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table },
        scheduleRefresh,
      );
    }
    channel.subscribe();

    return () => {
      if (pending) clearTimeout(pending);
      scheduleRefreshRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [router, debounceMs, enabled, instanceId, tablesKey, opts.channelPrefix]);

  return { markLocalWrite };
}
