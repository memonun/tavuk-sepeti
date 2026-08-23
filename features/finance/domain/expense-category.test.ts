import { describe, expect, it } from "vitest";

import {
  activeCategoryNodes,
  buildCategoryTree,
  canBeParent,
  collectSelfAndDescendantIds,
  formatCategoryPath,
  rollupToParentAmounts,
  type CategoryAmount,
  type ExpenseCategory,
} from "@/features/finance/domain/expense-category";

function cat(overrides: Partial<ExpenseCategory> & { id: string }): ExpenseCategory {
  return {
    name: overrides.id,
    parent_id: null,
    system_key: null,
    active: true,
    sort_order: 0,
    created_at: new Date("2026-01-01T00:00:00Z"),
    updated_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("buildCategoryTree", () => {
  it("nests children under their parent, ordered by sort_order then name", () => {
    const uretim = cat({ id: "uretim", name: "Üretim Giderleri", sort_order: 0 });
    const yem = cat({ id: "yem", name: "Tavuk Yemi", parent_id: "uretim", sort_order: 1 });
    const vet = cat({ id: "vet", name: "Veteriner", parent_id: "uretim", sort_order: 0 });
    const diger = cat({ id: "diger", name: "Diğer", sort_order: 1 });

    const tree = buildCategoryTree([uretim, yem, vet, diger]);

    expect(tree.map((n) => n.id)).toEqual(["uretim", "diger"]);
    expect(tree[0]?.children.map((c) => c.id)).toEqual(["vet", "yem"]);
    expect(tree[1]?.children).toEqual([]);
  });

  it("includes archived categories (historical expenses still need their label)", () => {
    const archived = cat({ id: "old", name: "Eski Kategori", active: false });
    const tree = buildCategoryTree([archived]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.active).toBe(false);
  });
});

describe("activeCategoryNodes", () => {
  it("drops archived top-level categories and archived children", () => {
    const active = cat({ id: "a", name: "Aktif" });
    const archivedParent = cat({ id: "b", name: "Pasif Ana", active: false });
    const child = cat({ id: "c", name: "Aktif Alt", parent_id: "a" });
    const archivedChild = cat({ id: "d", name: "Pasif Alt", parent_id: "a", active: false });

    const tree = buildCategoryTree([active, archivedParent, child, archivedChild]);
    const result = activeCategoryNodes(tree);

    expect(result.map((n) => n.id)).toEqual(["a"]);
    expect(result[0]?.children.map((c) => c.id)).toEqual(["c"]);
  });

  it("keeps a childless top-level category selectable (Pazar Giderleri, Diğer)", () => {
    const diger = cat({ id: "diger", name: "Diğer" });
    const tree = buildCategoryTree([diger]);
    expect(activeCategoryNodes(tree)).toHaveLength(1);
  });
});

describe("collectSelfAndDescendantIds", () => {
  const uretim = cat({ id: "uretim" });
  const yem = cat({ id: "yem", parent_id: "uretim" });
  const vet = cat({ id: "vet", parent_id: "uretim" });
  const diger = cat({ id: "diger" });
  const all = [uretim, yem, vet, diger];

  it("expands a top-level selection to itself + all children", () => {
    expect(collectSelfAndDescendantIds(all, "uretim").sort()).toEqual(["uretim", "vet", "yem"].sort());
  });

  it("a childless / leaf selection returns only itself", () => {
    expect(collectSelfAndDescendantIds(all, "yem")).toEqual(["yem"]);
    expect(collectSelfAndDescendantIds(all, "diger")).toEqual(["diger"]);
  });
});

describe("canBeParent", () => {
  it("a top-level category (parent_id null) can be a parent", () => {
    expect(canBeParent(cat({ id: "a", parent_id: null }))).toBe(true);
  });
  it("a child category (parent_id set) can never be a parent — max two levels", () => {
    expect(canBeParent(cat({ id: "b", parent_id: "a" }))).toBe(false);
  });
});

describe("formatCategoryPath", () => {
  it("joins parent and child with an arrow", () => {
    expect(formatCategoryPath("Tavuk Yemi", "Üretim Giderleri")).toBe("Üretim Giderleri → Tavuk Yemi");
  });
  it("returns the bare name for a top-level category", () => {
    expect(formatCategoryPath("Diğer", null)).toBe("Diğer");
  });
});

describe("rollupToParentAmounts", () => {
  it("sums multiple children into their shared parent", () => {
    const rows: CategoryAmount[] = [
      { categoryId: "yem", categoryName: "Tavuk Yemi", parentId: "uretim", parentName: "Üretim Giderleri", amountMinor: 7_320_000 },
      { categoryId: "vet", categoryName: "Veteriner", parentId: "uretim", parentName: "Üretim Giderleri", amountMinor: 1_000_000 },
    ];
    const result = rollupToParentAmounts(rows);
    expect(result).toEqual([{ id: "uretim", name: "Üretim Giderleri", amountMinor: 8_320_000 }]);
  });

  it("a childless top-level category rolls up to itself", () => {
    const rows: CategoryAmount[] = [
      { categoryId: "diger", categoryName: "Diğer", parentId: null, parentName: null, amountMinor: 500 },
    ];
    expect(rollupToParentAmounts(rows)).toEqual([{ id: "diger", name: "Diğer", amountMinor: 500 }]);
  });

  it("orders largest amount first", () => {
    const rows: CategoryAmount[] = [
      { categoryId: "a", categoryName: "A", parentId: null, parentName: null, amountMinor: 100 },
      { categoryId: "b", categoryName: "B", parentId: null, parentName: null, amountMinor: 900 },
    ];
    expect(rollupToParentAmounts(rows).map((r) => r.id)).toEqual(["b", "a"]);
  });
});
