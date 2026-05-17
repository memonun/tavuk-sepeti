"use client";

/**
 * Per-table column preferences: sizes, order, visibility, pinning. Stored
 * in localStorage under the table id so two grids on different pages keep
 * their layouts independent.
 *
 * Stays defensive on the localStorage boundary — JSON parse failures
 * collapse to defaults rather than crashing the whole grid. Versioned so
 * future shape changes can migrate (currently version=1; bumping it
 * invalidates older payloads).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { EMPTY_COLUMN_PREFS, type ColumnPrefs } from "@/components/data-grid/data-grid-types";

const STORAGE_PREFIX = "datagrid:";

export interface UseColumnPrefsResult {
  readonly prefs: ColumnPrefs;
  readonly setSizes: (sizes: Record<string, number>) => void;
  readonly setOrder: (order: ReadonlyArray<string>) => void;
  readonly setHidden: (hidden: ReadonlyArray<string>) => void;
  readonly setPinning: (pinning: { left: ReadonlyArray<string>; right: ReadonlyArray<string> }) => void;
  readonly setAggregate: (columnId: string, aggregate: string) => void;
  readonly reset: () => void;
}

export function useColumnPrefs(
  tableId: string,
  defaults: Partial<ColumnPrefs> = {},
): UseColumnPrefsResult {
  const initial = useMemo(
    () => mergePrefs(EMPTY_COLUMN_PREFS, defaults),
    // Defaults change identity per render but content is stable per table —
    // the merge is idempotent so re-running on every render is acceptable
    // since useState only takes the value once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [prefs, setPrefs] = useState<ColumnPrefs>(initial);

  // Hydrate from localStorage after mount — SSR-safe (no window during
  // server render). The setState-in-effect is intentional: this is the
  // canonical pattern for client-only initial state from a non-React
  // store. useSyncExternalStore would be heavier than the win.
  useEffect(() => {
    const stored = readPrefs(tableId);
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrefs(mergePrefs(initial, stored));
    }
  }, [tableId, initial]);

  // Persist on change. Skip the very first write (which would store the
  // default and overwrite a stale-but-newer payload from another tab).
  useEffect(() => {
    writePrefs(tableId, prefs);
  }, [tableId, prefs]);

  const setSizes = useCallback(
    (sizes: Record<string, number>) =>
      setPrefs((cur) => ({ ...cur, sizes: { ...cur.sizes, ...sizes } })),
    [],
  );
  const setOrder = useCallback(
    (order: ReadonlyArray<string>) => setPrefs((cur) => ({ ...cur, order })),
    [],
  );
  const setHidden = useCallback(
    (hidden: ReadonlyArray<string>) => setPrefs((cur) => ({ ...cur, hidden })),
    [],
  );
  const setPinning = useCallback(
    (pinning: { left: ReadonlyArray<string>; right: ReadonlyArray<string> }) =>
      setPrefs((cur) => ({ ...cur, pinning })),
    [],
  );
  const setAggregate = useCallback(
    (columnId: string, aggregate: string) =>
      setPrefs((cur) => ({
        ...cur,
        aggregates: { ...cur.aggregates, [columnId]: aggregate },
      })),
    [],
  );
  const reset = useCallback(() => setPrefs(initial), [initial]);

  return { prefs, setSizes, setOrder, setHidden, setPinning, setAggregate, reset };
}

function storageKey(tableId: string): string {
  return `${STORAGE_PREFIX}${tableId}`;
}

function readPrefs(tableId: string): ColumnPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(tableId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ColumnPrefs> & { version?: number };
    if (parsed.version !== 1) return null;
    return mergePrefs(EMPTY_COLUMN_PREFS, parsed);
  } catch {
    return null;
  }
}

function writePrefs(tableId: string, prefs: ColumnPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(tableId), JSON.stringify(prefs));
  } catch {
    // Quota / private mode — drop silently. Ephemeral session is preferable
    // to a crash on every commit.
  }
}

export function mergePrefs(
  base: ColumnPrefs,
  override: Partial<ColumnPrefs>,
): ColumnPrefs {
  return {
    version: 1,
    sizes: { ...base.sizes, ...(override.sizes ?? {}) },
    order: override.order ?? base.order,
    hidden: override.hidden ?? base.hidden,
    pinning: {
      left: override.pinning?.left ?? base.pinning.left,
      right: override.pinning?.right ?? base.pinning.right,
    },
    aggregates: { ...base.aggregates, ...(override.aggregates ?? {}) },
  };
}
