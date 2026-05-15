/**
 * Public type contract for the Notion-style DataGrid primitive.
 *
 * Lives in components/ (ui-primitive layer) so feature UIs can import it
 * directly while shared/ stays free of React/shadcn concerns. The grid is
 * generic over the row shape (TRow) and the patch payload sent on cell
 * commit (TPatch) — features supply concrete instances.
 *
 * The shape is intentionally narrow: the grid never reaches into the
 * server. Mutations come back through `onCellCommit` / `onBulkCreate` so
 * the feature owns its application layer + Server Actions.
 */
import type { ColumnDef, RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { z } from "zod";

import type { AppError } from "@/shared/errors/app-error";
import type { Result } from "@/shared/result";

/** Identifier for one cell — column id + row id. Used by selection,
 *  edit-state, and clipboard logic. */
export interface CellAddress {
  readonly rowId: string;
  readonly columnId: string;
}

/** A 2D rectangle of cells (anchor → focus). Inclusive on both bounds. */
export interface CellRange {
  readonly anchor: CellAddress;
  readonly focus: CellAddress;
}

/**
 * Editor contract for one column. The `schema` is the source of truth for
 * validation — both for inline edits and for clipboard paste (the same
 * raw string is parsed both ways).
 */
export interface CellEditor<TValue> {
  /** Zod parser. Anything reaching the server has been validated by this. */
  readonly schema: z.ZodType<TValue>;
  /** How to display the parsed value when not editing. */
  render: (value: TValue) => ReactNode;
  /**
   * How to render the input when this cell is being edited. The editor
   * MUST call onCommit(rawValue) when the user confirms (Enter / blur)
   * or onCancel() when they bail (Escape).
   */
  edit: (props: {
    readonly value: TValue;
    readonly onCommit: (rawValue: unknown) => void;
    readonly onCancel: () => void;
  }) => ReactNode;
  /**
   * Convert a raw clipboard string into something the schema can parse.
   * Returning Err short-circuits the paste with a user-facing message.
   * Defaults to identity (string in, string out).
   */
  parseFromClipboard?: (raw: string) => Result<unknown, AppError>;
  /**
   * Convert the parsed value back into a clipboard string. Used when the
   * user copies the cell. Defaults to String(value).
   */
  toClipboard?: (value: TValue) => string;
}

/**
 * DataGrid column definition — extends TanStack's ColumnDef with edit +
 * paste + pin-default metadata.
 *
 * The generic parameters need to be loose because TanStack's ColumnDef
 * has its own internals; we surface only the bits feature columns care
 * about.
 */
export type DataGridColumn<TRow extends RowData> = ColumnDef<TRow> & {
  /** When true, the cell becomes interactive (double-click / Enter to edit). */
  editable?: boolean;
  /** Required when editable=true. */
  editor?: CellEditor<unknown>;
  /** Initial pin side. User can override via the column header menu. */
  defaultPin?: "left" | "right";
  /** Default visibility. User can override via the visibility menu. */
  defaultVisible?: boolean;
};

/**
 * Mutations the grid expects. Features wire these to their own Server
 * Actions; the grid never knows about Supabase / fetch.
 */
export interface DataGridMutations<TRow, TPatch> {
  /** Single-cell commit. Returns the fresh row (server-of-truth) on success. */
  onCellCommit: (rowId: string, patch: TPatch) => Promise<Result<TRow, AppError>>;
  /**
   * Optional. When provided, paste-into-empty-rows opens the preview
   * dialog and calls this with the parsed rows. Returns the inserted rows.
   */
  onBulkCreate?: (rows: ReadonlyArray<Partial<TRow>>) => Promise<Result<TRow[], AppError>>;
}

/**
 * Props for the DataGrid component itself.
 */
export interface DataGridProps<TRow, TPatch> {
  readonly data: ReadonlyArray<TRow>;
  readonly columns: ReadonlyArray<DataGridColumn<TRow>>;
  /** Stable id extractor — used for keying, selection, and optimistic patches. */
  readonly rowId: (row: TRow) => string;
  /** Identifier used as the localStorage namespace for column prefs. */
  readonly tableId: string;
  /** Server-side pagination — the grid renders only what's passed in. */
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
  /** Mutations. Optional so read-only previews can mount the grid too. */
  readonly mutations?: DataGridMutations<TRow, TPatch>;
  /** Render the inline expand panel below a row. */
  readonly renderRowExpand?: (row: TRow) => ReactNode;
  /** Convert a single-cell commit into the feature's patch shape. */
  readonly buildPatch?: (columnId: string, value: unknown) => TPatch;
}

/** Persisted, per-table user prefs (column sizes, order, visibility). */
export interface ColumnPrefs {
  readonly version: 1;
  readonly sizes: Readonly<Record<string, number>>;
  readonly order: ReadonlyArray<string>;
  readonly hidden: ReadonlyArray<string>;
  readonly pinning: {
    readonly left: ReadonlyArray<string>;
    readonly right: ReadonlyArray<string>;
  };
}

export const EMPTY_COLUMN_PREFS: ColumnPrefs = {
  version: 1,
  sizes: {},
  order: [],
  hidden: [],
  pinning: { left: [], right: [] },
};
