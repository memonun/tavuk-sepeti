/**
 * Saved view aggregate — domain types for the DataGrid views feature.
 *
 * A View captures a snapshot of grid state for a given tableId. Owners
 * save several per grid ("Aktif İstanbul müşterileri", "Bu hafta…")
 * and switch via the tab bar. RLS scopes everything to the owner.
 *
 * `config` is opaque to the DB (jsonb) — schemas in view.schema.ts
 * parse it on the way out so any drift between the persisted shape
 * and what the grid expects throws at the application boundary, not
 * deep in the UI.
 */

export interface ViewConfig {
  /** URL-driven query state: filter values keyed by URL param name
   *  (q, status, city, tag, account_type, legacy_segment, location). */
  readonly filters: Readonly<Record<string, string>>;
  /** Sort directive — single column for the URL-bound path; multi-sort
   *  is handled client-side by TanStack. */
  readonly sort: {
    readonly column: string;
    readonly order: "asc" | "desc";
  } | null;
  /** Single grouping column (TanStack supports nested but we ship one). */
  readonly groupBy: string | null;
  /** Per-column UI state — sizes / order / visibility / pinning /
   *  aggregates. Mirrors ColumnPrefs from the DataGrid primitive. */
  readonly columnState: {
    readonly sizes: Readonly<Record<string, number>>;
    readonly order: ReadonlyArray<string>;
    readonly hidden: ReadonlyArray<string>;
    readonly pinning: {
      readonly left: ReadonlyArray<string>;
      readonly right: ReadonlyArray<string>;
    };
    readonly aggregates: Readonly<Record<string, string>>;
  };
}

export interface View {
  readonly id: string;
  readonly tableId: string;
  readonly ownerId: string;
  readonly name: string;
  readonly config: ViewConfig;
  readonly isDefault: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const EMPTY_VIEW_CONFIG: ViewConfig = {
  filters: {},
  sort: null,
  groupBy: null,
  columnState: {
    sizes: {},
    order: [],
    hidden: [],
    pinning: { left: [], right: [] },
    aggregates: {},
  },
};
