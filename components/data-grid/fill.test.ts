import { describe, expect, it } from "vitest";

import { computeFillWrites } from "@/components/data-grid/fill";

const at = (rowId: string, columnId: string) => ({ rowId, columnId });
const ORDER = { rowIds: ["r1", "r2", "r3", "r4"], colIds: ["c1", "c2"] };

// source values keyed "rowId colId"
const SRC = new Map<string, string>([
  ["r1 c1", "A"],
  ["r2 c1", "B"],
]);
const valueAt = (cell: { rowId: string; columnId: string }) =>
  SRC.get(`${cell.rowId} ${cell.columnId}`) ?? "";

describe("computeFillWrites", () => {
  it("repeats a single source cell down the drag", () => {
    const single = new Map([["r1 c1", "X"]]);
    const writes = computeFillWrites({
      source: { anchor: at("r1", "c1"), focus: at("r1", "c1") },
      target: { anchor: at("r1", "c1"), focus: at("r3", "c1") },
      order: ORDER,
      valueAt: (c) => single.get(`${c.rowId} ${c.columnId}`) ?? "",
    });
    expect(writes).toEqual([
      { rowId: "r2", columnId: "c1", value: "X" },
      { rowId: "r3", columnId: "c1", value: "X" },
    ]);
  });

  it("tiles a multi-cell source pattern down the drag", () => {
    const writes = computeFillWrites({
      source: { anchor: at("r1", "c1"), focus: at("r2", "c1") },
      target: { anchor: at("r1", "c1"), focus: at("r4", "c1") },
      order: ORDER,
      valueAt,
    });
    expect(writes).toEqual([
      { rowId: "r3", columnId: "c1", value: "A" },
      { rowId: "r4", columnId: "c1", value: "B" },
    ]);
  });

  it("fills to the right across columns", () => {
    const single = new Map([["r1 c1", "Y"]]);
    const writes = computeFillWrites({
      source: { anchor: at("r1", "c1"), focus: at("r1", "c1") },
      target: { anchor: at("r1", "c1"), focus: at("r1", "c2") },
      order: ORDER,
      valueAt: (c) => single.get(`${c.rowId} ${c.columnId}`) ?? "",
    });
    expect(writes).toEqual([{ rowId: "r1", columnId: "c2", value: "Y" }]);
  });

  it("returns no writes when target equals source", () => {
    const writes = computeFillWrites({
      source: { anchor: at("r1", "c1"), focus: at("r1", "c1") },
      target: { anchor: at("r1", "c1"), focus: at("r1", "c1") },
      order: ORDER,
      valueAt,
    });
    expect(writes).toEqual([]);
  });
});
