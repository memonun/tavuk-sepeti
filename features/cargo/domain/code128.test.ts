import { describe, expect, it } from "vitest";

import {
  CODE128_PATTERNS,
  code128Symbols,
  code128Widths,
} from "@/features/cargo/domain/code128";

describe("Code 128 symbol table", () => {
  it("has 107 unique symbols, 11 modules each (stop: 13)", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((pattern, value) => {
      const modules = [...pattern].reduce((sum, w) => sum + Number(w), 0);
      expect(modules, `symbol ${value}`).toBe(value === 106 ? 13 : 11);
    });
  });
});

describe("code128Symbols", () => {
  it("packs an even run of digits two per symbol (set C)", () => {
    // Start C (105), 12, 34, checksum (105 + 12*1 + 34*2) % 103 = 82, stop.
    expect(code128Symbols("1234")).toEqual([105, 12, 34, 82, 106]);
  });

  it("switches to set B for an odd last digit", () => {
    // 105, 12, 34, Code B (100), "5" (21); checksum
    // (105 + 12 + 68 + 300 + 84) % 103 = 54.
    expect(code128Symbols("12345")).toEqual([105, 12, 34, 100, 21, 54, 106]);
  });

  it("uses set B for text", () => {
    // Start B (104), "A" (33), "b" (66); checksum (104 + 33 + 132) % 103 = 63.
    expect(code128Symbols("Ab")).toEqual([104, 33, 66, 63, 106]);
  });

  it("refuses characters outside printable ASCII", () => {
    expect(code128Symbols("Ş")).toBeNull();
    expect(code128Symbols("")).toBeNull();
  });
});

describe("code128Widths", () => {
  it("expands symbols into bar/space widths ending with the stop pattern", () => {
    const widths = code128Widths("26081800477");
    expect(widths).not.toBeNull();
    expect(widths?.slice(0, 6)).toEqual([2, 1, 1, 2, 3, 2]); // start C
    expect(widths?.slice(-7)).toEqual([2, 3, 3, 1, 1, 1, 2]); // stop
    // An odd count of elements: the barcode starts and ends with a bar.
    expect((widths?.length ?? 0) % 2).toBe(1);
  });
});
