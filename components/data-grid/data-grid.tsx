"use client";

/**
 * Notion/Excel-style interactive data grid.
 *
 * Wires together: TanStack Table (sort/visibility/order/pinning/resizing/
 * expansion) + custom cell selection + custom inline editing + clipboard
 * copy/paste.
 *
 * Interaction model — closest to Excel/Notion:
 *  - Single click selects the cell (Shift+Click extends)
 *  - The selected cell receives keyboard focus so arrows / Enter / typing
 *    flow through the same shortcut router
 *  - Enter or F2 starts editing the active cell
 *  - Typing a printable character starts editing AND overwrites the value
 *  - Escape clears the selection
 *  - Cmd/Ctrl+C serializes the selection rectangle to TSV
 *
 * Sticky pinning recipe lives in pinning/pinning-styles.ts. The wrapping
 * <table> sets borderCollapse:separate so the inset shadow on the last
 * left-pinned + first right-pinned cells renders correctly.
 */
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getGroupedRowModel,
  getSortedRowModel,
  type ColumnPinningState,
  type ColumnSizingState,
  type ExpandedState,
  type GroupingState,
  type SortingState,
  type VisibilityState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  type ClipboardEvent,
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AGGREGATE_LABELS,
  type AggregateKind,
  computeAggregate,
} from "@/components/data-grid/calculations";
import { ColumnVisibilityMenu } from "@/components/data-grid/column-visibility-menu";
import { DataGridHeaderCell } from "@/components/data-grid/column-header";
import { GroupByMenu } from "@/components/data-grid/group-by-menu";
import {
  EMPTY_COLUMN_PREFS,
  type CellAddress,
  type DataGridColumn,
  type DataGridProps,
} from "@/components/data-grid/data-grid-types";
import { useCellSelection } from "@/components/data-grid/hooks/use-cell-selection";
import { useClipboard } from "@/components/data-grid/hooks/use-clipboard";
import { useColumnPrefs } from "@/components/data-grid/hooks/use-column-prefs";
import { useOptimisticRows } from "@/components/data-grid/hooks/use-optimistic-rows";
import { computeFillWrites } from "@/components/data-grid/fill";
import { parseClipboardTable } from "@/components/data-grid/paste/parse-tsv";
import {
  getPinningHeaderStyles,
  getPinningStyles,
} from "@/components/data-grid/pinning/pinning-styles";
import {
  activeRangeCells,
  cellInRanges,
  rangesToCells,
} from "@/components/data-grid/selection-model";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ValidationError } from "@/shared/errors/app-error";
import { isErr } from "@/shared/result";
import type { AppError } from "@/shared/errors/app-error";
import type { Result } from "@/shared/result";

interface EditingCell {
  readonly rowId: string;
  readonly columnId: string;
  /** Pre-populated value when editing starts via direct typing
   *  ("type to overwrite" Excel/Notion behavior). */
  readonly seedValue?: string;
}

interface DataGridExtraProps {
  readonly columnLabels?: Readonly<Record<string, string>>;
  readonly toolbar?: ReactNode;
  readonly footer?: ReactNode;
  readonly onCellError?: (message: string, error: AppError) => void;
  readonly onCellSuccess?: () => void;
}

const cellKey = (rowId: string, columnId: string) => `${rowId}::${columnId}`;

const PRINTABLE_KEY_RE = /^[\p{L}\p{N}\p{P}\p{S} ]$/u;

export function DataGrid<TRow extends object, TPatch>({
  data,
  columns,
  rowId,
  tableId,
  totalCount,
  page,
  pageSize,
  mutations,
  renderRowExpand,
  buildPatch,
  toOptimisticPatch,
  columnLabels,
  toolbar,
  footer,
  onCellError,
  onCellSuccess,
}: DataGridProps<TRow, TPatch> & DataGridExtraProps) {
  const { prefs, setSizes, setOrder, setHidden, setPinning, setAggregate } = useColumnPrefs(
    tableId,
    initialPrefsFromColumns(columns),
  );

  // ---- TanStack Table state ----------------------------------------------

  const [sorting, setSorting] = useState<SortingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [grouping, setGrouping] = useState<GroupingState>([]);

  const columnVisibility: VisibilityState = useMemo(
    () => Object.fromEntries(prefs.hidden.map((id) => [id, false])),
    [prefs.hidden],
  );
  const columnSizing: ColumnSizingState = useMemo(
    () => ({ ...prefs.sizes }),
    [prefs.sizes],
  );
  const columnPinning: ColumnPinningState = useMemo(
    () => ({ left: [...prefs.pinning.left], right: [...prefs.pinning.right] }),
    [prefs.pinning],
  );

  // Normalize columns: when a column declares an editor but no custom
  // `cell` renderer, fall back to editor.render(value). TanStack Table's
  // own default cell is `({ getValue }) => getValue()` which would
  // surface raw enum values ("active") instead of the editor's badge or
  // formatted string.
  const normalizedColumns = useMemo(() => {
    return columns.map((col) => {
      if (col.cell !== undefined || !col.editor) return col;
      return {
        ...col,
        cell: ({ getValue }: { getValue: () => unknown }) =>
          col.editor!.render(getValue() as never),
      } as DataGridColumn<TRow>;
    });
  }, [columns]);

  // ---- Optimistic rows ---------------------------------------------------

  const noopMutate = useCallback(
    async (_id: string, _patch: TPatch): Promise<Result<TRow, AppError>> => ({
      ok: false,
      error: new ValidationError({ message: "No mutations configured." }),
    }),
    [],
  );

  const { rows, commit } = useOptimisticRows<TRow, TPatch>({
    base: data,
    rowId,
    mutate: mutations?.onCellCommit ?? noopMutate,
  });

  const table = useReactTable<TRow>({
    data: rows as TRow[],
    columns: normalizedColumns,
    state: {
      sorting,
      columnVisibility,
      columnSizing,
      columnPinning,
      expanded,
      grouping,
      ...(prefs.order.length > 0 ? { columnOrder: [...prefs.order] } : {}),
    },
    onSortingChange: setSorting,
    onGroupingChange: setGrouping,
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnVisibility) : updater;
      const hidden = Object.entries(next)
        .filter(([, visible]) => visible === false)
        .map(([id]) => id);
      setHidden(hidden);
    },
    onColumnSizingChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnSizing) : updater;
      setSizes(next);
    },
    onColumnPinningChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnPinning) : updater;
      setPinning({ left: next.left ?? [], right: next.right ?? [] });
    },
    onColumnOrderChange: (updater) => {
      const cur = prefs.order.length > 0 ? [...prefs.order] : table.getAllLeafColumns().map((c) => c.id);
      const next = typeof updater === "function" ? updater(cur) : updater;
      setOrder(next);
    },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowCanExpand: (row) => Boolean(renderRowExpand) && !row.getIsGrouped(),
    getRowId: (row) => rowId(row),
    columnResizeMode: "onChange",
    enableColumnPinning: true,
    enableColumnResizing: true,
    enableHiding: true,
    manualPagination: true,
    manualSorting: false,
    pageCount: Math.max(1, Math.ceil(totalCount / pageSize)),
  });

  const tableRows = table.getRowModel().rows;
  const visibleLeafColumns = table.getVisibleLeafColumns();
  const visibleColIds = useMemo(() => visibleLeafColumns.map((c) => c.id), [visibleLeafColumns]);
  const visibleRowIds = useMemo(() => tableRows.map((r) => r.id), [tableRows]);
  // Total visible columns including the optional left gutter (1) and the
  // optional right expand chevron (1) — used by the empty-state colspan
  // and the inline expand row.
  const colCount =
    visibleLeafColumns.length + 1 + (renderRowExpand ? 1 : 0);

  // ---- Multi-row selection -----------------------------------------------
  const [selectedRowIds, setSelectedRowIds] = useState<ReadonlySet<string>>(new Set());

  const toggleRowSelection = useCallback((id: string, checked: boolean) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const selectAllVisibleRows = useCallback(
    (checked: boolean) => {
      setSelectedRowIds(checked ? new Set(visibleRowIds) : new Set());
    },
    [visibleRowIds],
  );

  const clearRowSelection = useCallback(() => setSelectedRowIds(new Set()), []);

  const allVisibleSelected =
    visibleRowIds.length > 0 &&
    visibleRowIds.every((id) => selectedRowIds.has(id));
  const someVisibleSelected =
    !allVisibleSelected && visibleRowIds.some((id) => selectedRowIds.has(id));

  // ---- Refs / focus management -------------------------------------------

  const parentRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>());
  const registerCell = useCallback(
    (key: string, node: HTMLTableCellElement | null) => {
      const map = cellRefs.current;
      if (node === null) map.delete(key);
      else map.set(key, node);
    },
    [],
  );

  // ---- Selection + editing state ----------------------------------------

  const selection = useCellSelection();
  const clipboard = useClipboard();
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  // Fill handle: while dragging, holds the cell the pointer is currently
  // over so we can preview + compute the target rectangle on release.
  const [fillTarget, setFillTarget] = useState<CellAddress | null>(null);
  const fillTargetRef = useRef<CellAddress | null>(null);
  const fillingRef = useRef(false);
  const [isFilling, setIsFilling] = useState(false);

  // Drag-to-select: tracks whether the user is click-dragging across cells
  // to build a selection rectangle (Excel/Sheets behavior).
  const isDraggingSelect = useRef(false);

  const getColDef = useCallback(
    (columnId: string): DataGridColumn<TRow> | undefined => {
      const col = table.getColumn(columnId);
      return col ? (col.columnDef as DataGridColumn<TRow>) : undefined;
    },
    [table],
  );

  const handleStartEdit = useCallback(
    (addr: CellAddress, seedValue?: string) => {
      const colDef = getColDef(addr.columnId);
      if (!colDef?.editable || !colDef.editor) return;
      setEditingCell(
        seedValue !== undefined
          ? { rowId: addr.rowId, columnId: addr.columnId, seedValue }
          : { rowId: addr.rowId, columnId: addr.columnId },
      );
    },
    [getColDef],
  );

  const handleCommitEdit = useCallback(
    async (cell: EditingCell, rawValue: unknown) => {
      const colDef = getColDef(cell.columnId);
      const editor = colDef?.editor;
      if (!editor) {
        setEditingCell(null);
        return;
      }
      const parsed = editor.schema.safeParse(rawValue);
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Geçersiz değer.";
        onCellError?.(message, new ValidationError({ message, details: parsed.error.flatten() }));
        setEditingCell(null);
        return;
      }
      const patch =
        buildPatch?.(cell.columnId, parsed.data) ??
        ({ [cell.columnId]: parsed.data } as unknown as TPatch);
      // Optimistic row partial. Defaults to identity (column id === row
      // field, committed value === display value); features override via
      // toOptimisticPatch when those don't hold (status, delivery_fee).
      const optimisticPartial =
        toOptimisticPatch?.(cell.columnId, parsed.data) ??
        ({ [cell.columnId]: parsed.data } as Partial<TRow>);
      setEditingCell(null);
      const result = await commit(cell.rowId, optimisticPartial, patch);
      if (isErr(result)) {
        onCellError?.(result.error.message, result.error);
      } else {
        onCellSuccess?.();
      }
    },
    [getColDef, commit, buildPatch, toOptimisticPatch, onCellError, onCellSuccess],
  );

  const handleCancelEdit = useCallback(() => setEditingCell(null), []);

  // Focus the active cell when selection changes (and we're not editing).
  // Skip the focus pull on first paint so the page doesn't auto-scroll
  // the grid into view.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (editingCell) return;
    const active = selection.activeCell;
    if (!active) return;
    const node = cellRefs.current.get(cellKey(active.rowId, active.columnId));
    node?.focus({ preventScroll: false });
  }, [selection.activeCell, editingCell]);

  // Drag-to-select: clear the flag on any mouseup so selection drag ends.
  useEffect(() => {
    function onUp() {
      isDraggingSelect.current = false;
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  // Fill handle: commit the dragged rectangle on mouse-up. The source is
  // the active range; the target shares the source's anchor and extends to
  // the cell under the pointer. Tiling + readonly-skip happen here.
  useEffect(() => {
    if (!isFilling) return;
    function onUp() {
      const target = fillTargetRef.current;
      fillingRef.current = false;
      setIsFilling(false);
      setFillTarget(null);
      fillTargetRef.current = null;
      const start = selection.activeCell;
      if (!start || !target || !selection.state || selection.state.ranges.length === 0) return;
      const order = { rowIds: visibleRowIds, colIds: visibleColIds };
      const source = selection.state.ranges[selection.state.ranges.length - 1]!;
      const targetRange = { anchor: source.anchor, focus: target };
      const writes = computeFillWrites({
        source,
        target: targetRange,
        order,
        valueAt: (cell) => {
          const colDef = getColDef(cell.columnId);
          const tableRow = tableRows.find((r) => r.id === cell.rowId);
          const value = tableRow?.getValue(cell.columnId) as unknown;
          if (colDef?.editor?.toClipboard) return colDef.editor.toClipboard(value);
          return value == null ? "" : String(value);
        },
      });
      for (const w of writes) {
        const colDef = getColDef(w.columnId);
        if (!colDef?.editable || !colDef.editor) continue; // skip readonly silently
        if (!colDef.editor.schema.safeParse(w.value).success) continue; // skip non-applicable cells silently
        void handleCommitEdit({ rowId: w.rowId, columnId: w.columnId }, w.value);
      }
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [
    isFilling,
    selection.activeCell,
    selection.state,
    visibleRowIds,
    visibleColIds,
    getColDef,
    tableRows,
    handleCommitEdit,
  ]);

  // Move the active cell by (dRow, dCol). Wraps on column overflow within
  // the same row; clamps at the grid edges.
  const moveActive = useCallback(
    (dRow: number, dCol: number) => {
      const active = selection.activeCell;
      if (!active) {
        const firstRowId = visibleRowIds[0];
        const firstColId = visibleColIds[0];
        if (firstRowId && firstColId) {
          selection.selectCell({ rowId: firstRowId, columnId: firstColId });
        }
        return;
      }
      const rIdx = visibleRowIds.indexOf(active.rowId);
      const cIdx = visibleColIds.indexOf(active.columnId);
      if (rIdx < 0 || cIdx < 0) return;
      const nextR = Math.min(visibleRowIds.length - 1, Math.max(0, rIdx + dRow));
      const nextC = Math.min(visibleColIds.length - 1, Math.max(0, cIdx + dCol));
      const nextRowId = visibleRowIds[nextR];
      const nextColId = visibleColIds[nextC];
      if (!nextRowId || !nextColId) return;
      selection.selectCell({ rowId: nextRowId, columnId: nextColId });
    },
    [selection, visibleRowIds, visibleColIds],
  );

  // ---- Copy --------------------------------------------------------------

  const handleCopy = useCallback(async () => {
    if (!selection.state) return false;
    const grid = activeRangeCells(selection.state, {
      rowIds: visibleRowIds,
      colIds: visibleColIds,
    });
    if (grid.length === 0) return false;
    const rowById = new Map(tableRows.map((r) => [r.id, r]));
    const tsv: string[][] = grid.map((row) =>
      row.map((cell) => {
        const colDef = getColDef(cell.columnId);
        const tableRow = rowById.get(cell.rowId);
        const value = tableRow?.getValue(cell.columnId) as unknown;
        const editor = colDef?.editor;
        if (editor?.toClipboard) return editor.toClipboard(value);
        return value == null ? "" : String(value);
      }),
    );
    return clipboard.copy(tsv);
  }, [clipboard, selection.state, tableRows, visibleColIds, visibleRowIds, getColDef]);

  // ---- Paste -------------------------------------------------------------

  const handlePaste = useCallback(
    async (e: ClipboardEvent<HTMLDivElement>) => {
      const text = e.clipboardData?.getData("text/plain");
      if (!text) return;
      e.preventDefault();
      const { rows: parsed } = parseClipboardTable(text);
      if (parsed.length === 0) return;
      const startCell = selection.activeCell;
      if (!startCell) return;
      const startRow = visibleRowIds.indexOf(startCell.rowId);
      const startCol = visibleColIds.indexOf(startCell.columnId);
      if (startRow < 0 || startCol < 0) return;
      for (let r = 0; r < parsed.length; r++) {
        const targetRowIdx = startRow + r;
        if (targetRowIdx >= visibleRowIds.length) break;
        const targetRowId = visibleRowIds[targetRowIdx];
        if (!targetRowId) continue;
        const cells = parsed[r] ?? [];
        for (let c = 0; c < cells.length; c++) {
          const targetColIdx = startCol + c;
          if (targetColIdx >= visibleColIds.length) break;
          const targetColId = visibleColIds[targetColIdx];
          if (!targetColId) continue;
          const colDef = getColDef(targetColId);
          if (!colDef?.editable || !colDef.editor) continue;
          const raw = cells[c] ?? "";
          const fromClip =
            colDef.editor.parseFromClipboard?.(raw) ?? { ok: true as const, value: raw };
          if (!fromClip.ok) {
            onCellError?.(fromClip.error.message, fromClip.error);
            continue;
          }
          await handleCommitEdit({ rowId: targetRowId, columnId: targetColId }, fromClip.value);
        }
      }
    },
    [selection.activeCell, visibleRowIds, visibleColIds, getColDef, handleCommitEdit, onCellError],
  );

  const [addRowBusy, setAddRowBusy] = useState(false);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const handleBulkDelete = useCallback(async () => {
    if (!mutations?.onBulkDelete || selectedRowIds.size === 0) return;
    const ids = Array.from(selectedRowIds);
    setBulkDeleteBusy(true);
    try {
      const result = await mutations.onBulkDelete(ids);
      if (isErr(result)) {
        onCellError?.(result.error.message, result.error);
      } else {
        clearRowSelection();
        onCellSuccess?.();
      }
    } finally {
      setBulkDeleteBusy(false);
    }
  }, [mutations, selectedRowIds, onCellError, onCellSuccess, clearRowSelection]);

  // ---- Cell-level keyboard handler --------------------------------------

  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTableCellElement>, addr: CellAddress) => {
      if (editingCell) return;
      switch (e.key) {
        case "Enter":
        case "F2":
          e.preventDefault();
          handleStartEdit(addr);
          return;
        case "Escape":
          e.preventDefault();
          selection.clear();
          return;
        case "ArrowUp":
          e.preventDefault();
          moveActive(-1, 0);
          return;
        case "ArrowDown":
          e.preventDefault();
          moveActive(1, 0);
          return;
        case "ArrowLeft":
          e.preventDefault();
          moveActive(0, -1);
          return;
        case "ArrowRight":
          e.preventDefault();
          moveActive(0, 1);
          return;
        case "Tab":
          e.preventDefault();
          moveActive(0, e.shiftKey ? -1 : 1);
          return;
        default:
          break;
      }
      // Cmd/Ctrl+C → copy. Don't intercept the modifier-less printable
      // path until after the shortcut check.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        void handleCopy();
        return;
      }
      // Delete/Backspace → clear every editable cell across all ranges.
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selection.state) return;
        e.preventDefault();
        const cells = rangesToCells(selection.state, {
          rowIds: visibleRowIds,
          colIds: visibleColIds,
        });
        for (const cell of cells) {
          const colDef = getColDef(cell.columnId);
          if (!colDef?.editable || !colDef.editor) continue;
          if (!colDef.editor.schema.safeParse("").success) continue; // skip non-applicable cells silently
          void handleCommitEdit({ rowId: cell.rowId, columnId: cell.columnId }, "");
        }
        return;
      }
      // Type-to-edit: a printable character without modifiers starts
      // editing the active cell with the typed character as the seed.
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key.length === 1 &&
        PRINTABLE_KEY_RE.test(e.key)
      ) {
        e.preventDefault();
        handleStartEdit(addr, e.key);
      }
    },
    [
      editingCell,
      handleStartEdit,
      selection,
      moveActive,
      handleCopy,
      handleCommitEdit,
      getColDef,
      visibleRowIds,
      visibleColIds,
    ],
  );

  // ---- Render ------------------------------------------------------------

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      {/* Single-row Notion-style toolbar: filter chips on the left,
          row-level actions on the right. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex flex-1 flex-wrap items-center gap-1.5">{toolbar}</div>
        <div className="flex items-center gap-1.5">
          <GroupByMenu
            table={table}
            grouping={grouping}
            onChange={(next) => setGrouping([...next])}
            {...(columnLabels !== undefined ? { columnLabels } : {})}
          />

          <ColumnVisibilityMenu
            table={table}
            {...(columnLabels !== undefined ? { columnLabels } : {})}
          />
        </div>
      </div>

      {/* Bulk action bar — appears in place of nothing when rows are
          selected. Floats above the table so it's always reachable. */}
      {selectedRowIds.size > 0 ? (
        <div className="flex items-center justify-between rounded-md border bg-foreground px-2 py-1 text-xs text-background shadow-sm">
          <span>
            <strong>{selectedRowIds.size}</strong> satır seçili
          </span>
          <div className="flex items-center gap-1">
            {mutations?.onBulkDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={bulkDeleteBusy}
                onClick={() => setConfirmDeleteOpen(true)}
                className="h-6 gap-1 px-2 text-xs text-background hover:bg-background/10 hover:text-background"
              >
                <Trash2 className="h-3 w-3" />
                {bulkDeleteBusy ? "Siliniyor…" : "Sil"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearRowSelection}
              className="h-6 gap-1 px-2 text-xs text-background hover:bg-background/10 hover:text-background"
            >
              <X className="h-3 w-3" />
              Temizle
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Silme onayı</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Seçili {selectedRowIds.size} kaydı silmek istediğine emin misin? Bu
            işlem geri alınamaz.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDeleteOpen(false)}
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={bulkDeleteBusy}
              onClick={() => {
                setConfirmDeleteOpen(false);
                void handleBulkDelete();
              }}
            >
              Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        ref={parentRef}
        role="grid"
        aria-rowcount={totalCount}
        aria-colcount={visibleLeafColumns.length}
        onPaste={handlePaste}
        className="relative min-h-0 flex-1 overflow-auto rounded-md border bg-background"
      >
        <table
          className="text-[13px]"
          style={{
            width: table.getTotalSize(),
            borderCollapse: "separate",
            borderSpacing: 0,
          }}
        >
          <thead className="sticky top-0 z-20">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {/* Left gutter — select-all checkbox + drag handle slot */}
                <th
                  className="sticky left-0 z-10 h-8 w-7 border-b border-r border-border bg-muted px-1 align-middle"
                  style={{ width: 28 }}
                >
                  <input
                    type="checkbox"
                    aria-label="Tümünü seç"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someVisibleSelected;
                    }}
                    onChange={(e) => selectAllVisibleRows(e.target.checked)}
                    className="h-3.5 w-3.5 cursor-pointer accent-blue-600"
                  />
                </th>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    style={getPinningHeaderStyles(header.column)}
                    className="h-8 border-b border-r border-border bg-muted text-left align-middle"
                  >
                    {header.isPlaceholder ? null : (
                      <DataGridHeaderCell
                        header={header}
                        currentAggregate={
                          (prefs.aggregates[header.column.id] as
                            | AggregateKind
                            | undefined) ?? "none"
                        }
                        onAggregateChange={(kind) =>
                          setAggregate(header.column.id, kind)
                        }
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </DataGridHeaderCell>
                    )}
                  </th>
                ))}
                {renderRowExpand ? (
                  <th
                    aria-hidden
                    className="border-b border-r border-border bg-muted"
                    style={{ width: 36 }}
                  />
                ) : null}
              </tr>
            ))}
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  Sonuç yok.
                </td>
              </tr>
            ) : null}
            {tableRows.map((row) => {
              // Grouped row: render a single full-width header row with
              // chevron + label + count, no editable cells.
              if (row.getIsGrouped()) {
                const groupCol = table.getColumn(row.groupingColumnId!);
                const groupLabel =
                  columnLabels?.[row.groupingColumnId!] ??
                  (typeof groupCol?.columnDef.header === "string"
                    ? groupCol.columnDef.header
                    : row.groupingColumnId);
                const groupValue = row.getGroupingValue(row.groupingColumnId!);
                const display =
                  groupValue === null || groupValue === undefined || groupValue === ""
                    ? "(boş)"
                    : String(groupValue);
                return (
                  <tr key={row.id} className="bg-muted/40">
                    <td
                      colSpan={colCount}
                      className="h-7 cursor-pointer border-b border-border px-2 text-left text-xs font-medium hover:bg-muted/60"
                      onClick={() => row.toggleExpanded()}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {row.getIsExpanded() ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <span className="text-muted-foreground">{groupLabel}:</span>
                        <span className="text-foreground">{display}</span>
                        <span className="text-muted-foreground">
                          ({row.subRows.length})
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              }
              const isRowSelected = selectedRowIds.has(row.id);
              return (
              <Fragment key={row.id}>
                <tr
                  className={cn(
                    "group",
                    isRowSelected && "bg-blue-50/50 dark:bg-blue-950/20",
                  )}
                >
                  {/* Left gutter: drag handle (visual) + checkbox, hover-revealed */}
                  <td
                    className={cn(
                      "sticky left-0 z-[1] h-8 border-b border-r border-border align-middle",
                      isRowSelected ? "bg-blue-50 dark:bg-blue-950/40" : "bg-background group-hover:bg-muted/40",
                    )}
                    style={{ width: 28 }}
                  >
                    <div className="flex h-full items-center justify-center gap-0.5">
                      <GripVertical
                        className={cn(
                          "h-3 w-3 text-muted-foreground/40 opacity-0 transition-opacity",
                          "group-hover:opacity-100",
                          isRowSelected && "opacity-100",
                        )}
                      />
                      <input
                        type="checkbox"
                        checked={isRowSelected}
                        onChange={(e) => toggleRowSelection(row.id, e.target.checked)}
                        aria-label={`Satırı seç`}
                        className={cn(
                          "h-3.5 w-3.5 cursor-pointer accent-blue-600 transition-opacity",
                          isRowSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                        )}
                      />
                    </div>
                  </td>
                  {row.getVisibleCells().map((cell) => {
                    const colDef = cell.column.columnDef as DataGridColumn<TRow>;
                    const addr: CellAddress = {
                      rowId: row.id,
                      columnId: cell.column.id,
                    };
                    const isEditing =
                      editingCell?.rowId === row.id && editingCell.columnId === cell.column.id;
                    const isActive =
                      selection.activeCell?.rowId === row.id &&
                      selection.activeCell.columnId === cell.column.id;
                    const isSelected = selection.isSelected(
                      addr,
                      visibleRowIds,
                      visibleColIds,
                    );
                    // Fill-drag preview: synthetic range from the active
                    // range's anchor to the cell currently under the pointer.
                    const inFillPreview =
                      isFilling &&
                      fillTarget != null &&
                      selection.state != null &&
                      selection.state.ranges.length > 0 &&
                      cellInRanges(
                        {
                          ranges: [
                            {
                              anchor:
                                selection.state.ranges[selection.state.ranges.length - 1]!.anchor,
                              focus: fillTarget,
                            },
                          ],
                          active: fillTarget,
                        },
                        addr,
                        { rowIds: visibleRowIds, colIds: visibleColIds },
                      );
                    const k = cellKey(row.id, cell.column.id);
                    return (
                      <td
                        key={cell.id}
                        ref={(node) => registerCell(k, node)}
                        tabIndex={isActive ? 0 : -1}
                        style={{
                          ...getPinningStyles(cell.column),
                          // Notion-style active outline; inline so it isn't
                          // killed by `outline-none` from earlier utilities
                          // and isn't shadowed by the pinning box-shadow.
                          ...(isActive
                            ? {
                                outline: "2px solid #2563eb",
                                outlineOffset: "-2px",
                              }
                            : {}),
                        }}
                        className={cn(
                          "h-8 border-b border-r border-border align-middle outline-none transition-shadow duration-100",
                          "group-hover:bg-muted/40",
                          isSelected &&
                            "bg-blue-50 dark:bg-blue-950/40",
                          isActive &&
                            "bg-blue-50 group-hover:bg-blue-50 dark:bg-blue-950/40 dark:group-hover:bg-blue-950/40",
                          inFillPreview && "ring-1 ring-inset ring-primary/50",
                          colDef.editable && !isEditing && "cursor-cell",
                        )}
                        onMouseEnter={() => {
                          if (fillingRef.current) {
                            fillTargetRef.current = addr;
                            setFillTarget(addr);
                          }
                          if (isDraggingSelect.current) {
                            selection.extendSelectionTo(addr);
                          }
                        }}
                        onMouseDown={(e) => {
                          if (e.shiftKey) {
                            selection.extendSelectionTo(addr);
                            return;
                          }
                          // Cmd/Ctrl-click always adds a disjoint range — intentionally bypasses
                          // the click-to-edit path, matching Excel/Sheets multi-select.
                          if (e.ctrlKey || e.metaKey) {
                            selection.addSelectionRange(addr);
                            return;
                          }
                          // Notion-style "click an already-active cell to
                          // edit" — first click selects + focuses, second
                          // click on the same cell flips into edit mode.
                          if (isActive && colDef.editable) {
                            handleStartEdit(addr);
                            return;
                          }
                          isDraggingSelect.current = true;
                          selection.selectCell(addr);
                        }}
                        onDoubleClick={() =>
                          handleStartEdit({ rowId: row.id, columnId: cell.column.id })
                        }
                        onKeyDown={(e) =>
                          handleCellKeyDown(e, { rowId: row.id, columnId: cell.column.id })
                        }
                      >
                        {isEditing && colDef.editor ? (
                          <colDef.editor.edit
                            value={
                              editingCell.seedValue !== undefined
                                ? (editingCell.seedValue as never)
                                : (cell.getValue() as never)
                            }
                            onCommit={(raw) =>
                              void handleCommitEdit(
                                { rowId: row.id, columnId: cell.column.id },
                                raw,
                              )
                            }
                            onCancel={handleCancelEdit}
                          />
                        ) : (
                          <div className="truncate px-2 py-1">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        )}
                        {/* Fill handle — drag to tile the active cell's value down/right. */}
                        {isActive && !isEditing ? (
                          <div
                            role="presentation"
                            aria-hidden="true"
                            className="absolute -bottom-[3px] -right-[3px] z-10 h-2 w-2 cursor-crosshair rounded-[1px] bg-primary"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              fillingRef.current = true;
                              fillTargetRef.current = addr;
                              setIsFilling(true);
                              setFillTarget(addr);
                            }}
                          />
                        ) : null}
                      </td>
                    );
                  })}
                  {renderRowExpand ? (
                    <td
                      className="border-b border-r border-border align-middle"
                      style={{ width: 36 }}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => row.toggleExpanded()}
                        aria-label={row.getIsExpanded() ? "Daralt" : "Genişlet"}
                      >
                        {row.getIsExpanded() ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </td>
                  ) : null}
                </tr>
                {row.getIsExpanded() && renderRowExpand ? (
                  <tr className="bg-muted/20">
                    <td colSpan={colCount} className="border-b border-border p-4">
                      {renderRowExpand(row.original)}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
              );
            })}
            {/* "+ Yeni satır" sentinel — Notion-style always-visible footer.
                Clicking it calls onAddRow to insert a blank row the admin
                can complete inline or via the detail panel. */}
            {mutations?.onAddRow ? (
              <tr className="group">
                <td
                  colSpan={colCount}
                  aria-disabled={addRowBusy}
                  className={cn(
                    "h-8 cursor-pointer border-b border-border px-3 text-left text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                    addRowBusy ? "pointer-events-none opacity-60" : "",
                  )}
                  onClick={() => {
                    if (addRowBusy) return;
                    setAddRowBusy(true);
                    void (async () => {
                      try {
                        const result = await mutations.onAddRow!();
                        if (!result.ok) onCellError?.(result.error.message, result.error);
                        else onCellSuccess?.();
                      } finally {
                        setAddRowBusy(false);
                      }
                    })();
                  }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Plus className="h-3 w-3" />
                    Yeni satır
                  </span>
                </td>
              </tr>
            ) : null}
          </tbody>
          {/* Calculations bar — sticky footer with per-column aggregates.
              Only renders when at least one column has an aggregate set
              so we don't take vertical space for nothing. */}
          {Object.keys(prefs.aggregates).some((id) => {
            const v = prefs.aggregates[id];
            return v && v !== "none";
          }) ? (
            <tfoot className="sticky bottom-0 z-10">
              <tr>
                <td
                  className="sticky left-0 z-[1] h-7 border-t border-r border-border bg-muted/80 px-1"
                  style={{ width: 28 }}
                />
                {visibleLeafColumns.map((col) => {
                  const kind = (prefs.aggregates[col.id] as AggregateKind | undefined) ?? "none";
                  if (kind === "none") {
                    return (
                      <td
                        key={col.id}
                        style={getPinningHeaderStyles(col)}
                        className="h-7 border-t border-r border-border bg-muted/80"
                      />
                    );
                  }
                  const values = tableRows.map((r) => r.getValue(col.id));
                  const result = computeAggregate(kind, values);
                  return (
                    <td
                      key={col.id}
                      style={getPinningHeaderStyles(col)}
                      className="h-7 border-t border-r border-border bg-muted/80 px-2 text-right text-[11px] tabular-nums text-muted-foreground"
                      title={AGGREGATE_LABELS[kind]}
                    >
                      <span className="mr-1 text-[10px] uppercase opacity-70">
                        {AGGREGATE_LABELS[kind]}
                      </span>
                      <span className="font-medium text-foreground">
                        {result ?? "—"}
                      </span>
                    </td>
                  );
                })}
                {renderRowExpand ? (
                  <td
                    aria-hidden
                    className="border-t border-r border-border bg-muted/80"
                    style={{ width: 36 }}
                  />
                ) : null}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {totalCount === 0
            ? "Sonuç yok."
            : `Sayfa ${page} — ${tableRows.length} satır gösteriliyor (toplam ${totalCount}).`}
        </span>
        <div>{footer}</div>
      </div>
    </div>
  );
}

function initialPrefsFromColumns<TRow>(
  columns: ReadonlyArray<DataGridColumn<TRow>>,
): Partial<typeof EMPTY_COLUMN_PREFS> {
  const left: string[] = [];
  const right: string[] = [];
  const hidden: string[] = [];
  for (const col of columns) {
    const id = (col.id ?? (col as { accessorKey?: string }).accessorKey) as string | undefined;
    if (!id) continue;
    if (col.defaultPin === "left") left.push(id);
    else if (col.defaultPin === "right") right.push(id);
    if (col.defaultVisible === false) hidden.push(id);
  }
  return { pinning: { left, right }, hidden };
}
