"use client";

/**
 * Thin wrapper around @tanstack/react-virtual tuned for the DataGrid:
 *
 * - estimateSize defaults to 44px (one TableRow with 8px vertical padding)
 * - overscan 10 rows above/below the viewport — covers most fast scrolls
 *   without paying a measurable JS cost
 * - dynamic measureElement so expanded rows (variable height) settle
 *   correctly after one frame
 *
 * Returned virtualizer is the raw TanStack instance so callers can hook
 * into scrollToIndex / measureElement / getVirtualItems directly.
 */
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

export interface UseVirtualizedRowsOptions {
  readonly count: number;
  readonly estimateSize?: number;
  readonly overscan?: number;
}

export interface UseVirtualizedRowsResult {
  readonly parentRef: React.RefObject<HTMLDivElement | null>;
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
}

export function useVirtualizedRows({
  count,
  estimateSize = 44,
  overscan = 10,
}: UseVirtualizedRowsOptions): UseVirtualizedRowsResult {
  const parentRef = useRef<HTMLDivElement | null>(null);
  // Dynamic measurement — let the virtualizer use its own ResizeObserver
  // path. Expanded rows (variable height) settle after one frame.
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });
  return { parentRef, virtualizer };
}
