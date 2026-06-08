import { describe, expect, it } from "vitest";

import {
  addRange,
  activeRangeCells,
  cellInRanges,
  type SelectionState,
  extendActive,
  rangesToCells,
  replaceSelection,
} from "@/components/data-grid/selection-model";

const ORDER = {
  rowIds: ["r1", "r2", "r3", "r4"],
  colIds: ["c1", "c2", "c3"],
};
const a = (rowId: string, columnId: string) => ({ rowId, columnId });

describe("selection-model", () => {
  it("replaceSelection makes a single 1x1 range and sets it active", () => {
    const s = replaceSelection(a("r2", "c2"));
    expect(s.ranges).toHaveLength(1);
    expect(s.ranges[0]).toEqual({ anchor: a("r2", "c2"), focus: a("r2", "c2") });
    expect(s.active).toEqual(a("r2", "c2"));
  });

  it("extendActive moves the active range's focus, keeping its anchor", () => {
    const s0 = replaceSelection(a("r1", "c1"));
    const s1 = extendActive(s0, a("r3", "c2"));
    expect(s1.ranges[0]).toEqual({ anchor: a("r1", "c1"), focus: a("r3", "c2") });
    expect(s1.active).toEqual(a("r3", "c2"));
  });

  it("addRange appends a disjoint range and makes it active", () => {
    const s0 = replaceSelection(a("r1", "c1"));
    const s1 = addRange(s0, a("r4", "c3"));
    expect(s1.ranges).toHaveLength(2);
    expect(s1.active).toEqual(a("r4", "c3"));
  });

  it("cellInRanges is true for any cell inside any range (union)", () => {
    let s: SelectionState = replaceSelection(a("r1", "c1"));
    s = extendActive(s, a("r2", "c1")); // range A: r1-r2 x c1
    s = addRange(s, a("r4", "c3")); // range B: r4 x c3
    expect(cellInRanges(s, a("r1", "c1"), ORDER)).toBe(true);
    expect(cellInRanges(s, a("r2", "c1"), ORDER)).toBe(true);
    expect(cellInRanges(s, a("r4", "c3"), ORDER)).toBe(true);
    expect(cellInRanges(s, a("r3", "c1"), ORDER)).toBe(false);
    expect(cellInRanges(s, a("r1", "c2"), ORDER)).toBe(false);
  });

  it("cellInRanges returns false when a cell id is not in the current order", () => {
    const s = replaceSelection(a("r1", "c1"));
    expect(cellInRanges(s, a("ghost", "c1"), ORDER)).toBe(false);
  });
});

describe("selection-model cell extraction", () => {
  const ORDER2 = { rowIds: ["r1", "r2", "r3"], colIds: ["c1", "c2"] };
  const at = (rowId: string, columnId: string) => ({ rowId, columnId });

  it("activeRangeCells returns the active range as a row-major rectangle", () => {
    let s = replaceSelection(at("r1", "c1"));
    s = addRange(s, at("r2", "c1"));
    s = extendActive(s, at("r3", "c2")); // active range: r2-r3 x c1-c2
    const cells = activeRangeCells(s, ORDER2);
    expect(cells).toEqual([
      [at("r2", "c1"), at("r2", "c2")],
      [at("r3", "c1"), at("r3", "c2")],
    ]);
  });

  it("rangesToCells unions disjoint ranges with no duplicates", () => {
    let s = replaceSelection(at("r1", "c1"));
    s = addRange(s, at("r1", "c1")); // overlapping add — must not duplicate
    s = addRange(s, at("r3", "c2"));
    const cells = rangesToCells(s, ORDER2);
    expect(cells).toContainEqual(at("r1", "c1"));
    expect(cells).toContainEqual(at("r3", "c2"));
    expect(cells.filter((c) => c.rowId === "r1" && c.columnId === "c1")).toHaveLength(1);
  });
});
