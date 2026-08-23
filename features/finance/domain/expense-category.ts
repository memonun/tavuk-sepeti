/**
 * Managed expense category — replaces the free-text `expenses.category`
 * string from V1 so spending can actually be aggregated ("Bu ay tavuk yemine
 * ne kadar harcadık?" needs one "Tavuk Yemi" row, not four near-duplicates).
 *
 * Exactly two levels: a top-level category has `parent_id: null`; a child
 * category's `parent_id` points at a top-level category. A category whose
 * `parent_id` is itself non-null can never be used as a parent — enforced
 * both here (buildCategoryTree/validateCategoryDepth) and by a DB trigger
 * (expense_categories_enforce_depth), the same belt-and-suspenders approach
 * CLAUDE.md §11 asks for on state machines.
 *
 * `system_key` is a stable, ascii identifier used only by the legacy-data
 * backfill migration to find "the" Tavuk Yemi / Diğer / ... row without
 * hardcoding UUIDs anywhere in application code. It is null for every
 * category an admin creates through the UI.
 *
 * Archived (`active: false`) categories are never offered for new expenses
 * but keep appearing wherever historical data references them — a category
 * with expenses attached is never hard-deleted (spec: "Pasife Al", not
 * silent deletion).
 */

export interface ExpenseCategory {
  readonly id: string;
  readonly name: string;
  readonly parent_id: string | null;
  readonly system_key: string | null;
  readonly active: boolean;
  readonly sort_order: number;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/** A category with its direct children attached, for tree-shaped UI (the
 *  category selector, the management dialog). Only top-level categories can
 *  have children — a two-level tree, never deeper. */
export interface ExpenseCategoryNode extends ExpenseCategory {
  readonly children: readonly ExpenseCategoryNode[];
}

/** Assembles the flat category list into a two-level tree, top-level
 *  categories ordered by sort_order then name, children the same way under
 *  their parent. Archived categories are included — callers that only want
 *  categories usable on NEW expenses should filter on `.active` themselves
 *  (see activeCategoryNodes below); historical displays need the full set. */
export function buildCategoryTree(
  categories: readonly ExpenseCategory[],
): ExpenseCategoryNode[] {
  const byParent = new Map<string | null, ExpenseCategory[]>();
  for (const c of categories) {
    const bucket = byParent.get(c.parent_id) ?? [];
    bucket.push(c);
    byParent.set(c.parent_id, bucket);
  }

  const sortFn = (a: ExpenseCategory, b: ExpenseCategory) =>
    a.sort_order - b.sort_order || a.name.localeCompare(b.name, "tr");

  const toNode = (c: ExpenseCategory): ExpenseCategoryNode => ({
    ...c,
    children: (byParent.get(c.id) ?? []).sort(sortFn).map(toNode),
  });

  return (byParent.get(null) ?? []).sort(sortFn).map(toNode);
}

/** Only categories usable on a NEW expense (spec §4/§6: archived categories
 *  never appear in the create/edit form, only in historical displays). A
 *  top-level category stays selectable on its own even once every child
 *  under it is archived — "Pazar Giderleri"/"Diğer" have no children at all
 *  and must remain pickable. */
export function activeCategoryNodes(
  tree: readonly ExpenseCategoryNode[],
): ExpenseCategoryNode[] {
  return tree
    .filter((node) => node.active)
    .map((node) => ({ ...node, children: node.children.filter((c) => c.active) }));
}

/** Selecting a top-level category should filter to it AND every one of its
 *  children (spec §19); selecting a child (or a childless top-level
 *  category) filters to just that id. */
export function collectSelfAndDescendantIds(
  categories: readonly ExpenseCategory[],
  id: string,
): string[] {
  const children = categories.filter((c) => c.parent_id === id).map((c) => c.id);
  return [id, ...children];
}

/** A category is only a valid PARENT choice if it is itself top-level — a
 *  child can never have children of its own (max two levels, spec §1). */
export function canBeParent(category: ExpenseCategory): boolean {
  return category.parent_id === null;
}

/** `"Üretim Giderleri → Tavuk Yemi"` for a child, `"Diğer"` for a top-level
 *  category with no parent. `parentName` is looked up by the caller (the
 *  category list already carries the full tree). */
export function formatCategoryPath(name: string, parentName: string | null): string {
  return parentName ? `${parentName} → ${name}` : name;
}

/** One leaf-level "Detay" row for the Gider Dağılımı breakdown (spec §18) —
 *  shaped generically rather than importing the RPC row type directly, so
 *  this stays pure/Postgres-agnostic (domain may only import shared/own
 *  domain, per the ESLint boundaries rule). */
export interface CategoryAmount {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly parentId: string | null;
  readonly parentName: string | null;
  readonly amountMinor: number;
}

export interface ParentCategoryAmount {
  readonly id: string;
  readonly name: string;
  readonly amountMinor: number;
}

/** "Ana Kategoriler" view: sums each Detay row up to its top-level category
 *  (or itself, if it has no parent), largest first. */
export function rollupToParentAmounts(
  rows: readonly CategoryAmount[],
): ParentCategoryAmount[] {
  const byParent = new Map<string, ParentCategoryAmount>();
  for (const row of rows) {
    const id = row.parentId ?? row.categoryId;
    const name = row.parentId ? (row.parentName ?? row.categoryName) : row.categoryName;
    const existing = byParent.get(id);
    byParent.set(id, {
      id,
      name,
      amountMinor: (existing?.amountMinor ?? 0) + row.amountMinor,
    });
  }
  return Array.from(byParent.values()).sort((a, b) => b.amountMinor - a.amountMinor);
}
