"use client";

/**
 * Derives the driver's current run state from:
 *   - the optimized stop list (server-provided, stable across renders),
 *   - the delivered set (server-provided, computed from order.status),
 *   - the session-only skipped set (UI state, lost on reload).
 *
 * Persistence model: deliveries persist via the orders table — phone reload
 * keeps you on the right stop. Skips are deliberately session-only — the
 * driver might want to revisit a "skipped" stop the same run, and there's
 * no DB column for "skipped".
 */
import { useCallback, useMemo, useState } from "react";

import type { RouteStop } from "@/features/routing/domain/route";

export interface DriverState {
  /** Next stop the driver should head to, or null when run is complete. */
  currentStop: RouteStop | null;
  /** Stops in the original optimized order, with a derived status flag. */
  stopsWithStatus: ReadonlyArray<{
    stop: RouteStop;
    delivered: boolean;
    skipped: boolean;
    isCurrent: boolean;
  }>;
  /** Number of stops marked delivered so far. */
  deliveredCount: number;
  /** Number of stops the user has skipped this session. */
  skippedCount: number;
  totalCount: number;
  isComplete: boolean;
  markSkipped: (orderId: string) => void;
  unskip: (orderId: string) => void;
}

export function useDriverState(
  stops: readonly RouteStop[],
  deliveredOrderIds: ReadonlySet<string>,
): DriverState {
  const [skippedSet, setSkippedSet] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const markSkipped = useCallback((orderId: string) => {
    setSkippedSet((prev) => {
      if (prev.has(orderId)) return prev;
      const next = new Set(prev);
      next.add(orderId);
      return next;
    });
  }, []);

  const unskip = useCallback((orderId: string) => {
    setSkippedSet((prev) => {
      if (!prev.has(orderId)) return prev;
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
  }, []);

  return useMemo(() => {
    const stopsWithStatus = stops.map((stop) => ({
      stop,
      delivered: deliveredOrderIds.has(stop.order_id),
      skipped: skippedSet.has(stop.order_id),
      isCurrent: false, // overwritten below
    }));

    // Current = first non-delivered, non-skipped in optimized order.
    let currentIndex = stopsWithStatus.findIndex(
      (s) => !s.delivered && !s.skipped,
    );

    // If everything's been skipped or delivered, fall back to the first
    // non-delivered (the driver can unskip if they want to revisit).
    if (currentIndex === -1) {
      currentIndex = stopsWithStatus.findIndex((s) => !s.delivered);
    }

    if (currentIndex !== -1) {
      const current = stopsWithStatus[currentIndex];
      if (current) {
        stopsWithStatus[currentIndex] = { ...current, isCurrent: true };
      }
    }

    const deliveredCount = stopsWithStatus.filter((s) => s.delivered).length;
    const skippedCount = stopsWithStatus.filter((s) => s.skipped).length;
    const totalCount = stopsWithStatus.length;

    return {
      currentStop: currentIndex === -1 ? null : (stops[currentIndex] ?? null),
      stopsWithStatus,
      deliveredCount,
      skippedCount,
      totalCount,
      isComplete: deliveredCount === totalCount && totalCount > 0,
      markSkipped,
      unskip,
    };
  }, [stops, deliveredOrderIds, skippedSet, markSkipped, unskip]);
}
