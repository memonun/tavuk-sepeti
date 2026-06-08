/**
 * Pure fill-handle geometry. Given a source rectangle and a (larger)
 * target rectangle that shares the source's top-left, compute the cell
 * writes needed to tile the source pattern across the target — Excel's
 * fill-down / fill-right behavior. Source cells are never rewritten.
 *
 * The fill axis is whichever dimension grows: if the target extends below
 * the source, we tile down; if it extends to the right, we tile right.
 * (Down takes precedence when both grow — matching the common drag.)
 */
import type { CellAddress, CellRange } from "@/components/data-grid/data-grid-types";
import type { GridOrder } from "@/components/data-grid/selection-model";

export interface CellWrite {
  readonly rowId: string;
  readonly columnId: string;
  readonly value: string;
}

export interface FillArgs {
  readonly source: CellRange;
  readonly target: CellRange;
  readonly order: GridOrder;
  readonly valueAt: (cell: CellAddress) => string;
}

function bounds(range: CellRange, order: GridOrder) {
  const ar = order.rowIds.indexOf(range.anchor.rowId);
  const fr = order.rowIds.indexOf(range.focus.rowId);
  const ac = order.colIds.indexOf(range.anchor.columnId);
  const fc = order.colIds.indexOf(range.focus.columnId);
  return {
    top: Math.min(ar, fr),
    bot: Math.max(ar, fr),
    left: Math.min(ac, fc),
    right: Math.max(ac, fc),
  };
}

export function computeFillWrites({ source, target, order, valueAt }: FillArgs): CellWrite[] {
  const s = bounds(source, order);
  const t = bounds(target, order);
  if ([s.top, s.bot, s.left, s.right, t.top, t.bot, t.left, t.right].some((i) => i < 0)) {
    return [];
  }
  const writes: CellWrite[] = [];
  const srcRows = s.bot - s.top + 1;
  const srcCols = s.right - s.left + 1;

  const fillsDown = t.bot > s.bot;
  const fillsRight = t.right > s.right;

  for (let r = t.top; r <= t.bot; r++) {
    for (let c = t.left; c <= t.right; c++) {
      const inSource = r >= s.top && r <= s.bot && c >= s.left && c <= s.right;
      if (inSource) continue;
      const patternRow = fillsDown ? s.top + ((r - s.top) % srcRows) : r;
      const patternCol = fillsRight ? s.left + ((c - s.left) % srcCols) : c;
      const value = valueAt({
        rowId: order.rowIds[patternRow]!,
        columnId: order.colIds[patternCol]!,
      });
      writes.push({ rowId: order.rowIds[r]!, columnId: order.colIds[c]!, value });
    }
  }
  return writes;
}
