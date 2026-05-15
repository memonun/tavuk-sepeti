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
  type ColumnPinningState,
  type ColumnSizingState,
  type ExpandedState,
  type SortingState,
  type VisibilityState,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight, ClipboardPaste, GripVertical, Plus, Trash2, X } from "lucide-react";
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

import { ColumnVisibilityMenu } from "@/components/data-grid/column-visibility-menu";
import { DataGridHeaderCell } from "@/components/data-grid/column-header";
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
import { parseClipboardTable } from "@/components/data-grid/paste/parse-tsv";
import { PasteInputDialog } from "@/components/data-grid/paste/paste-input-dialog";
import {
  PastePreviewDialog,
  type PastePreviewRow,
} from "@/components/data-grid/paste/paste-preview-dialog";
import {
  getPinningHeaderStyles,
  getPinningStyles,
} from "@/components/data-grid/pinning/pinning-styles";
import { Button } from "@/components/ui/button";
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
  /** Singular noun used by the paste-create preview ("3 müşteri oluşturulacak"). */
  readonly entityLabel?: string;
}

interface BulkPasteState<TRow> {
  readonly headers: ReadonlyArray<string>;
  readonly headerColIds: ReadonlyArray<string>;
  readonly rawRows: ReadonlyArray<ReadonlyArray<string>>;
  readonly previewRows: ReadonlyArray<PastePreviewRow>;
  readonly parsedRows: ReadonlyArray<Partial<TRow>>;
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
  columnLabels,
  toolbar,
  footer,
  onCellError,
  onCellSuccess,
  entityLabel = "kayıt",
}: DataGridProps<TRow, TPatch> & DataGridExtraProps) {
  const { prefs, setSizes, setOrder, setHidden, setPinning } = useColumnPrefs(
    tableId,
    initialPrefsFromColumns(columns),
  );

  // ---- TanStack Table state ----------------------------------------------

  const [sorting, setSorting] = useState<SortingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});

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
      ...(prefs.order.length > 0 ? { columnOrder: [...prefs.order] } : {}),
    },
    onSortingChange: setSorting,
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
    getRowCanExpand: () => Boolean(renderRowExpand),
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
      setEditingCell(null);
      const result = await commit(cell.rowId, cell.columnId, parsed.data, patch);
      if (isErr(result)) {
        onCellError?.(result.error.message, result.error);
      } else {
        onCellSuccess?.();
      }
    },
    [getColDef, commit, buildPatch, onCellError, onCellSuccess],
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
    const sel = selection.selection;
    if (!sel) return false;
    const anchorR = visibleRowIds.indexOf(sel.anchor.rowId);
    const focusR = visibleRowIds.indexOf(sel.focus.rowId);
    const anchorC = visibleColIds.indexOf(sel.anchor.columnId);
    const focusC = visibleColIds.indexOf(sel.focus.columnId);
    if ([anchorR, focusR, anchorC, focusC].some((i) => i < 0)) return false;
    const [rTop, rBot] = anchorR <= focusR ? [anchorR, focusR] : [focusR, anchorR];
    const [cLeft, cRight] = anchorC <= focusC ? [anchorC, focusC] : [focusC, anchorC];
    const tsv: string[][] = [];
    for (let r = rTop; r <= rBot; r++) {
      const tableRow = tableRows[r];
      if (!tableRow) continue;
      const out: string[] = [];
      for (let c = cLeft; c <= cRight; c++) {
        const colId = visibleColIds[c];
        const column = visibleLeafColumns[c];
        if (!colId || !column) continue;
        const value = tableRow.getValue(colId) as unknown;
        const editor = (column.columnDef as DataGridColumn<TRow>).editor;
        const text = editor?.toClipboard ? editor.toClipboard(value) : String(value ?? "");
        out.push(text);
      }
      tsv.push(out);
    }
    return clipboard.copy(tsv);
  }, [clipboard, selection.selection, tableRows, visibleColIds, visibleLeafColumns, visibleRowIds]);

  // ---- Paste -------------------------------------------------------------

  const handlePaste = useCallback(
    async (e: ClipboardEvent<HTMLDivElement>) => {
      const text = e.clipboardData?.getData("text/plain");
      if (!text) return;
      e.preventDefault();
      const { rows: parsed } = parseClipboardTable(text);
      if (parsed.length === 0) return;
      const sel = selection.selection;
      if (!sel) return;
      const startRow = visibleRowIds.indexOf(sel.focus.rowId);
      const startCol = visibleColIds.indexOf(sel.focus.columnId);
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
    [selection.selection, visibleRowIds, visibleColIds, getColDef, handleCommitEdit, onCellError],
  );

  // ---- Bulk paste-create -------------------------------------------------
  //
  // Toolbar button reads the clipboard, parses it as TSV using the same
  // parser as in-cell paste, validates each cell against the column's
  // editor schema, and opens the preview dialog. Confirm fires the
  // onBulkCreate Server Action; success replaces the optimistic toast
  // and closes the dialog.

  const [bulkPaste, setBulkPaste] = useState<BulkPasteState<TRow> | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkInputOpen, setBulkInputOpen] = useState(false);

  const openBulkPasteFromText = useCallback(
    (text: string) => {
      const { rows: parsed } = parseClipboardTable(text);
      if (parsed.length === 0) {
        onCellError?.(
          "Pano boş veya tanınmayan formatta.",
          new ValidationError({ message: "Pano boş veya tanınmayan formatta." }),
        );
        return;
      }

      // Map clipboard columns to the first N visible editable columns —
      // user is expected to align their paste with the table layout.
      const editableCols = visibleLeafColumns
        .filter((c) => {
          const def = c.columnDef as DataGridColumn<TRow>;
          return def.editable && def.editor;
        })
        .slice(0, Math.max(...parsed.map((r) => r.length), 0));
      const headerColIds = editableCols.map((c) => c.id);
      const headers = editableCols.map(
        (c) => columnLabels?.[c.id] ?? (typeof c.columnDef.header === "string" ? c.columnDef.header : c.id),
      );

      const previewRows: PastePreviewRow[] = [];
      const parsedRows: Partial<TRow>[] = [];

      for (const rawRow of parsed) {
        const cells: string[] = [];
        const issues: string[] = [];
        const accumulator: Record<string, unknown> = {};
        for (let i = 0; i < headerColIds.length; i++) {
          const colId = headerColIds[i]!;
          const colDef = getColDef(colId);
          const raw = rawRow[i] ?? "";
          cells.push(raw);
          if (!colDef?.editor) continue;
          const fromClip =
            colDef.editor.parseFromClipboard?.(raw) ?? { ok: true as const, value: raw };
          if (!fromClip.ok) {
            issues.push(`${headers[i] ?? colId}: ${fromClip.error.message}`);
            continue;
          }
          const safe = colDef.editor.schema.safeParse(fromClip.value);
          if (!safe.success) {
            issues.push(
              `${headers[i] ?? colId}: ${safe.error.issues[0]?.message ?? "Geçersiz değer."}`,
            );
            continue;
          }
          accumulator[colId] = safe.data;
        }
        previewRows.push({ cells, issues });
        parsedRows.push(accumulator as Partial<TRow>);
      }

      setBulkPaste({
        headers,
        headerColIds,
        rawRows: parsed,
        previewRows,
        parsedRows,
      });
    },
    [columnLabels, getColDef, onCellError, visibleLeafColumns],
  );

  const handleOpenBulkPaste = useCallback(() => {
    // Always open the input dialog. Direct clipboard reads need a
    // permission grant (and the page must be focused), which routinely
    // fails in admin tabs that have lost focus while the user copies in
    // Excel. The textarea + Cmd+V is the universally-working pattern.
    setBulkInputOpen(true);
  }, []);

  const handleSubmitBulkInput = useCallback(
    (text: string) => {
      setBulkInputOpen(false);
      openBulkPasteFromText(text);
    },
    [openBulkPasteFromText],
  );

  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
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

  const handleBulkConfirm = useCallback(async () => {
    if (!bulkPaste || !mutations?.onBulkCreate) return;
    const validRows = bulkPaste.parsedRows.filter(
      (_, idx) => bulkPaste.previewRows[idx]?.issues.length === 0,
    );
    if (validRows.length === 0) {
      onCellError?.(
        "Geçerli satır yok.",
        new ValidationError({ message: "Geçerli satır yok." }),
      );
      return;
    }
    setBulkBusy(true);
    try {
      const result = await mutations.onBulkCreate(validRows);
      if (isErr(result)) {
        onCellError?.(result.error.message, result.error);
      } else {
        onCellSuccess?.();
        setBulkPaste(null);
      }
    } finally {
      setBulkBusy(false);
    }
  }, [bulkPaste, mutations, onCellError, onCellSuccess]);

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
    [editingCell, handleStartEdit, selection, moveActive, handleCopy],
  );

  // ---- Render ------------------------------------------------------------

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      {/* Single-row Notion-style toolbar: filter chips on the left,
          row-level actions on the right. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex flex-1 flex-wrap items-center gap-1.5">{toolbar}</div>
        <div className="flex items-center gap-1.5">
          {mutations?.onBulkCreate ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => void handleOpenBulkPaste()}
            >
              <ClipboardPaste className="h-3 w-3" />
              Toplu Yapıştır
            </Button>
          ) : null}
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
                onClick={() => void handleBulkDelete()}
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

      <PasteInputDialog
        open={bulkInputOpen}
        onOpenChange={setBulkInputOpen}
        entityLabel={entityLabel}
        onSubmit={handleSubmitBulkInput}
      />

      {bulkPaste ? (
        <PastePreviewDialog
          open
          onOpenChange={(open) => {
            if (!open) setBulkPaste(null);
          }}
          headers={bulkPaste.headers}
          rows={bulkPaste.previewRows}
          entityLabel={entityLabel}
          onConfirm={handleBulkConfirm}
          busy={bulkBusy}
        />
      ) : null}

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
                      <DataGridHeaderCell header={header}>
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
                    const isEditing =
                      editingCell?.rowId === row.id && editingCell.columnId === cell.column.id;
                    const isActive =
                      selection.activeCell?.rowId === row.id &&
                      selection.activeCell.columnId === cell.column.id;
                    const isSelected = selection.isSelected(
                      { rowId: row.id, columnId: cell.column.id },
                      visibleRowIds,
                      visibleColIds,
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
                          colDef.editable && !isEditing && "cursor-cell",
                        )}
                        onMouseDown={(e) => {
                          const addr: CellAddress = {
                            rowId: row.id,
                            columnId: cell.column.id,
                          };
                          if (e.shiftKey) {
                            selection.extendSelectionTo(addr);
                            return;
                          }
                          // Notion-style "click an already-active cell to
                          // edit" — first click selects + focuses, second
                          // click on the same cell flips into edit mode.
                          if (isActive && colDef.editable) {
                            handleStartEdit(addr);
                            return;
                          }
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
                Clicking it opens the bulk-paste input dialog as the
                quickest path to creating new rows; click "+ Yeni Müşteri"
                in the toolbar for the form route. */}
            {mutations?.onBulkCreate ? (
              <tr className="group">
                <td
                  colSpan={colCount}
                  className="h-8 cursor-pointer border-b border-border px-3 text-left text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  onClick={() => setBulkInputOpen(true)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Plus className="h-3 w-3" />
                    Yeni satır
                  </span>
                </td>
              </tr>
            ) : null}
          </tbody>
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
