"use client";

/**
 * Cell selection model — anchor + focus rectangle.
 *
 * Click sets both anchor and focus to the same cell. Shift+Click moves
 * only focus, expanding the rectangle. Cmd/Ctrl+Click is reserved for
 * multi-select (not implemented in Faz 1; keeps the API surface stable
 * for when we add it).
 *
 * The selection lives outside React-Table's own row-selection feature
 * because that one is row-granular only — we need cell granularity for
 * Excel-style copy/paste.
 */
import { useCallback, useMemo, useState } from "react";

import type { CellAddress, CellRange } from "@/components/data-grid/data-grid-types";

export interface UseCellSelectionResult {
  readonly selection: CellRange | null;
  readonly activeCell: CellAddress | null;
  readonly isSelected: (cell: CellAddress, rowIds: ReadonlyArray<string>, colIds: ReadonlyArray<string>) => boolean;
  readonly selectCell: (cell: CellAddress) => void;
  readonly extendSelectionTo: (cell: CellAddress) => void;
  readonly clear: () => void;
}

export function useCellSelection(): UseCellSelectionResult {
  const [selection, setSelection] = useState<CellRange | null>(null);

  const selectCell = useCallback((cell: CellAddress) => {
    setSelection({ anchor: cell, focus: cell });
  }, []);

  const extendSelectionTo = useCallback((cell: CellAddress) => {
    setSelection((cur) => {
      if (!cur) return { anchor: cell, focus: cell };
      return { anchor: cur.anchor, focus: cell };
    });
  }, []);

  const clear = useCallback(() => setSelection(null), []);

  const isSelected = useCallback(
    (
      cell: CellAddress,
      rowIds: ReadonlyArray<string>,
      colIds: ReadonlyArray<string>,
    ): boolean => {
      if (!selection) return false;
      const anchorRow = rowIds.indexOf(selection.anchor.rowId);
      const focusRow = rowIds.indexOf(selection.focus.rowId);
      const anchorCol = colIds.indexOf(selection.anchor.columnId);
      const focusCol = colIds.indexOf(selection.focus.columnId);
      if (anchorRow < 0 || focusRow < 0 || anchorCol < 0 || focusCol < 0) {
        return false;
      }
      const cellRow = rowIds.indexOf(cell.rowId);
      const cellCol = colIds.indexOf(cell.columnId);
      const [rTop, rBot] = anchorRow <= focusRow ? [anchorRow, focusRow] : [focusRow, anchorRow];
      const [cLeft, cRight] = anchorCol <= focusCol ? [anchorCol, focusCol] : [focusCol, anchorCol];
      return cellRow >= rTop && cellRow <= rBot && cellCol >= cLeft && cellCol <= cRight;
    },
    [selection],
  );

  const activeCell = useMemo(() => selection?.focus ?? null, [selection]);

  return { selection, activeCell, isSelected, selectCell, extendSelectionTo, clear };
}
