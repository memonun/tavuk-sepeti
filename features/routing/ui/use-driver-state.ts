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

export interface StopWithStatus {
  stop: RouteStop;
  delivered: boolean;
  skipped: boolean;
  isCurrent: boolean;
}

export interface DriverState {
  /** Next stop the driver should head to, or null when run is complete. */
  currentStop: RouteStop | null;
  /** Stops in the original optimized order, with a derived status flag. */
  stopsWithStatus: ReadonlyArray<StopWithStatus>;
  /** The stop currently being viewed (driver can step away from `current`). */
  viewStop: RouteStop | null;
  /** Status of the viewed stop. */
  viewStatus: { delivered: boolean; skipped: boolean; isCurrent: boolean };
  /** Index of the viewed stop in the optimized order. */
  viewIndex: number;
  canPrev: boolean;
  canNext: boolean;
  /** Number of stops marked delivered so far. */
  deliveredCount: number;
  /** Number of stops the user has skipped this session. */
  skippedCount: number;
  totalCount: number;
  isComplete: boolean;
  markSkipped: (orderId: string) => void;
  unskip: (orderId: string) => void;
  /** Step the viewed stop one earlier / later in the route. */
  goPrev: () => void;
  goNext: () => void;
  /** Jump the view to a specific stop index. */
  jumpTo: (index: number) => void;
  /** Snap the view back to the auto-computed current stop. */
  followCurrent: () => void;
}

export function useDriverState(
  stops: readonly RouteStop[],
  deliveredOrderIds: ReadonlySet<string>,
): DriverState {
  const [skippedSet, setSkippedSet] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // null = "follow the auto-computed current stop"; a number pins the view.
  const [manualView, setManualView] = useState<number | null>(null);

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

    // Viewed stop: the driver's manual selection, else the current stop, else
    // the first stop. Clamped to the valid range.
    const fallbackView = currentIndex === -1 ? 0 : currentIndex;
    const viewIndex =
      totalCount === 0
        ? -1
        : Math.min(Math.max(manualView ?? fallbackView, 0), totalCount - 1);
    const viewEntry = viewIndex === -1 ? null : stopsWithStatus[viewIndex];

    return {
      currentStop: currentIndex === -1 ? null : (stops[currentIndex] ?? null),
      stopsWithStatus,
      viewStop: viewEntry?.stop ?? null,
      viewStatus: {
        delivered: viewEntry?.delivered ?? false,
        skipped: viewEntry?.skipped ?? false,
        isCurrent: viewEntry?.isCurrent ?? false,
      },
      viewIndex,
      canPrev: viewIndex > 0,
      canNext: viewIndex !== -1 && viewIndex < totalCount - 1,
      deliveredCount,
      skippedCount,
      totalCount,
      isComplete: deliveredCount === totalCount && totalCount > 0,
      markSkipped,
      unskip,
      goPrev: () => setManualView(Math.max(viewIndex - 1, 0)),
      goNext: () =>
        setManualView(Math.min(viewIndex + 1, Math.max(totalCount - 1, 0))),
      jumpTo: (index: number) => setManualView(index),
      followCurrent: () => setManualView(null),
    };
  }, [stops, deliveredOrderIds, skippedSet, manualView, markSkipped, unskip]);
}
