"use client";

/**
 * Cell selection model — a list of rectangular ranges plus an active cell.
 *
 * Click replaces the selection. Shift+Click / Shift+Arrows extend the
 * active range. Cmd/Ctrl+Click adds a disjoint range. Membership is the
 * union of all ranges. Geometry lives in selection-model.ts (pure +
 * tested); this hook is just React state over it.
 */
import { useCallback, useMemo, useState } from "react";

import {
  addRange,
  cellInRanges,
  extendActive,
  replaceSelection,
  type GridOrder,
  type SelectionState,
} from "@/components/data-grid/selection-model";
import type { CellAddress } from "@/components/data-grid/data-grid-types";

export interface UseCellSelectionResult {
  readonly state: SelectionState | null;
  readonly activeCell: CellAddress | null;
  readonly isSelected: (cell: CellAddress, rowIds: ReadonlyArray<string>, colIds: ReadonlyArray<string>) => boolean;
  /** Click — replace the whole selection with a single cell. */
  readonly selectCell: (cell: CellAddress) => void;
  /** Shift — extend the active range to this cell. */
  readonly extendSelectionTo: (cell: CellAddress) => void;
  /** Cmd/Ctrl+Click — start a new disjoint range at this cell. */
  readonly addSelectionRange: (cell: CellAddress) => void;
  readonly clear: () => void;
}

export function useCellSelection(): UseCellSelectionResult {
  const [state, setState] = useState<SelectionState | null>(null);

  const selectCell = useCallback((cell: CellAddress) => {
    setState(replaceSelection(cell));
  }, []);

  const extendSelectionTo = useCallback((cell: CellAddress) => {
    setState((cur) => (cur ? extendActive(cur, cell) : replaceSelection(cell)));
  }, []);

  const addSelectionRange = useCallback((cell: CellAddress) => {
    setState((cur) => (cur ? addRange(cur, cell) : replaceSelection(cell)));
  }, []);

  const clear = useCallback(() => setState(null), []);

  const isSelected = useCallback(
    (cell: CellAddress, rowIds: ReadonlyArray<string>, colIds: ReadonlyArray<string>): boolean => {
      if (!state) return false;
      const order: GridOrder = { rowIds, colIds };
      return cellInRanges(state, cell, order);
    },
    [state],
  );

  const activeCell = useMemo(() => state?.active ?? null, [state]);

  return { state, activeCell, isSelected, selectCell, extendSelectionTo, addSelectionRange, clear };
}
