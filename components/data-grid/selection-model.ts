/**
 * Pure selection geometry for the DataGrid — no React, fully testable.
 *
 * A selection is a list of rectangular ranges (anchor → focus, inclusive)
 * plus the "active" cell, which is the focus of the most-recently touched
 * range. Click replaces; Shift extends the active range; Cmd/Ctrl-click
 * adds a disjoint range. Membership (`cellInRanges`) is the union of all
 * ranges — that's what drives the highlight + bulk clear.
 */
import type { CellAddress, CellRange } from "@/components/data-grid/data-grid-types";

export interface SelectionState {
  readonly ranges: ReadonlyArray<CellRange>;
  readonly active: CellAddress;
}

export interface GridOrder {
  readonly rowIds: ReadonlyArray<string>;
  readonly colIds: ReadonlyArray<string>;
}

export function replaceSelection(cell: CellAddress): SelectionState {
  return { ranges: [{ anchor: cell, focus: cell }], active: cell };
}

export function extendActive(state: SelectionState, focus: CellAddress): SelectionState {
  const ranges = state.ranges.slice();
  const lastIndex = ranges.length - 1;
  if (lastIndex < 0) return replaceSelection(focus);
  const current = ranges[lastIndex]!;
  ranges[lastIndex] = { anchor: current.anchor, focus };
  return { ranges, active: focus };
}

export function addRange(state: SelectionState, cell: CellAddress): SelectionState {
  return { ranges: [...state.ranges, { anchor: cell, focus: cell }], active: cell };
}

function rangeContains(range: CellRange, cell: CellAddress, order: GridOrder): boolean {
  const ar = order.rowIds.indexOf(range.anchor.rowId);
  const fr = order.rowIds.indexOf(range.focus.rowId);
  const ac = order.colIds.indexOf(range.anchor.columnId);
  const fc = order.colIds.indexOf(range.focus.columnId);
  const cr = order.rowIds.indexOf(cell.rowId);
  const cc = order.colIds.indexOf(cell.columnId);
  if ([ar, fr, ac, fc, cr, cc].some((i) => i < 0)) return false;
  const [top, bot] = ar <= fr ? [ar, fr] : [fr, ar];
  const [left, right] = ac <= fc ? [ac, fc] : [fc, ac];
  return cr >= top && cr <= bot && cc >= left && cc <= right;
}

export function cellInRanges(state: SelectionState, cell: CellAddress, order: GridOrder): boolean {
  return state.ranges.some((r) => rangeContains(r, cell, order));
}

/** Every cell address covered by any range, de-duplicated, in row-major
 *  order. Used by bulk clear (Delete) across disjoint ranges. */
export function rangesToCells(state: SelectionState, order: GridOrder): CellAddress[] {
  const seen = new Set<string>();
  const out: CellAddress[] = [];
  for (const rowId of order.rowIds) {
    for (const columnId of order.colIds) {
      const cell = { rowId, columnId };
      if (!cellInRanges(state, cell, order)) continue;
      const key = `${rowId} ${columnId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cell);
    }
  }
  return out;
}

/** The active range as an ordered rectangle of cells (row-major). Used by
 *  copy — a single Excel-compatible block. */
export function activeRangeCells(state: SelectionState, order: GridOrder): CellAddress[][] {
  const active = state.ranges[state.ranges.length - 1];
  if (!active) return [];
  const ar = order.rowIds.indexOf(active.anchor.rowId);
  const fr = order.rowIds.indexOf(active.focus.rowId);
  const ac = order.colIds.indexOf(active.anchor.columnId);
  const fc = order.colIds.indexOf(active.focus.columnId);
  if ([ar, fr, ac, fc].some((i) => i < 0)) return [];
  const [top, bot] = ar <= fr ? [ar, fr] : [fr, ar];
  const [left, right] = ac <= fc ? [ac, fc] : [fc, ac];
  const rows: CellAddress[][] = [];
  for (let r = top; r <= bot; r++) {
    const row: CellAddress[] = [];
    for (let c = left; c <= right; c++) {
      row.push({ rowId: order.rowIds[r]!, columnId: order.colIds[c]! });
    }
    rows.push(row);
  }
  return rows;
}
