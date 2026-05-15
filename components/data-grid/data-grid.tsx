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
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  type CSSProperties,
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
    columns: columns as DataGridColumn<TRow>[],
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
  const colCount = visibleLeafColumns.length + (renderRowExpand ? 1 : 0);

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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2">{toolbar}</div>
        <ColumnVisibilityMenu table={table} {...(columnLabels !== undefined ? { columnLabels } : {})} />
      </div>

      <div
        ref={parentRef}
        role="grid"
        aria-rowcount={totalCount}
        aria-colcount={visibleLeafColumns.length}
        onPaste={handlePaste}
        className="relative max-h-[calc(100vh-14rem)] overflow-auto rounded-md border bg-background"
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
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    style={getPinningHeaderStyles(header.column)}
                    className="h-9 border-b border-r border-border bg-muted text-left align-middle"
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
            {tableRows.map((row) => (
              <Fragment key={row.id}>
                <tr className="group">
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
                        style={getPinningStyles(cell.column)}
                        className={cn(
                          "h-9 border-b border-r border-border align-middle outline-none",
                          "group-hover:bg-muted/40",
                          isSelected && "bg-primary/5",
                          isActive &&
                            "ring-2 ring-primary ring-inset bg-primary/10 group-hover:bg-primary/10",
                          colDef.editable && !isEditing && "cursor-cell",
                        )}
                        onMouseDown={(e) => {
                          const addr: CellAddress = {
                            rowId: row.id,
                            columnId: cell.column.id,
                          };
                          if (e.shiftKey) selection.extendSelectionTo(addr);
                          else selection.selectCell(addr);
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
            ))}
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
