import { describe, expect, it } from "vitest";

import {
  monthSpan,
  productTallyByMonthQuerySchema,
} from "@/features/finance/domain/finance-query.schema";
import {
  buildMonthlyProductTally,
  monthRangeDays,
  buildProductTallyRows,
  groupGiftedByUnit,
  groupSoldByUnit,
  parsePiecesPerUnit,
  type ProductTallyRow,
} from "@/features/finance/domain/product-tally";

describe("buildProductTallyRows", () => {
  it("returns an empty list for no rows", () => {
    expect(buildProductTallyRows([])).toEqual([]);
  });

  it("folds one sold row and one gift row into a single product row", () => {
    const rows = buildProductTallyRows([
      { product_key: "kuru-kayisi", display_name: "Kuru Kayısı", kind: "sold", unit_label: "kg", quantity: 12 },
      { product_key: "kuru-kayisi", display_name: "Kuru Kayısı", kind: "gift", unit_label: "gr", quantity: 250 },
    ]);
    expect(rows).toEqual([
      {
        product_key: "kuru-kayisi",
        display_name: "Kuru Kayısı",
        sold: { unit_label: "kg", quantity: 12 },
        gifted: [{ unit_label: "gr", quantity: 250 }],
      },
    ]);
  });

  it("keeps a product with no sold rows (sold: null) if it was only ever gifted", () => {
    const rows = buildProductTallyRows([
      { product_key: "numune", display_name: "Numune Peynir", kind: "gift", unit_label: "gr", quantity: 100 },
    ]);
    expect(rows[0]?.sold).toBeNull();
    expect(rows[0]?.gifted).toEqual([{ unit_label: "gr", quantity: 100 }]);
  });

  it("keeps a product with no gift rows as an empty gifted array", () => {
    const rows = buildProductTallyRows([
      { product_key: "yumurta", display_name: "Yumurta", kind: "sold", unit_label: "adet", quantity: 480 },
    ]);
    expect(rows[0]?.gifted).toEqual([]);
  });

  it("keeps distinct gift unit labels as separate breakdown entries, never summed", () => {
    const rows = buildProductTallyRows([
      { product_key: "peynir", display_name: "Peynir", kind: "gift", unit_label: "gr", quantity: 50 },
      { product_key: "peynir", display_name: "Peynir", kind: "gift", unit_label: "adet", quantity: 1 },
    ]);
    expect(rows[0]?.gifted).toEqual([
      { unit_label: "gr", quantity: 50 },
      { unit_label: "adet", quantity: 1 },
    ]);
  });

  it("sorts rows by display_name (Turkish collation)", () => {
    const rows = buildProductTallyRows([
      { product_key: "b", display_name: "Süt", kind: "sold", unit_label: "litre", quantity: 1 },
      { product_key: "a", display_name: "Ayran", kind: "sold", unit_label: "litre", quantity: 1 },
    ]);
    expect(rows.map((r) => r.display_name)).toEqual(["Ayran", "Süt"]);
  });
});

const row = (
  product_key: string,
  display_name: string,
  sold: ProductTallyRow["sold"],
  gifted: ProductTallyRow["gifted"] = [],
): ProductTallyRow => ({ product_key, display_name, sold, gifted });

describe("groupSoldByUnit", () => {
  it("returns nothing for rows with no sold quantity", () => {
    expect(groupSoldByUnit([row("a", "A", null)])).toEqual([]);
  });

  it("never mixes two units in one group", () => {
    const groups = groupSoldByUnit([
      row("cheese", "Peynir", { unit_label: "kg", quantity: 9 }),
      row("eggs", "Yumurta", { unit_label: "adet", quantity: 480 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.unit_label).sort()).toEqual(["adet", "kg"]);
  });

  it("ranks rows within a group by quantity, descending", () => {
    const groups = groupSoldByUnit([
      row("a", "Az Satan", { unit_label: "kg", quantity: 3 }),
      row("b", "Çok Satan", { unit_label: "kg", quantity: 30 }),
    ]);
    expect(groups[0]?.rows.map((r) => r.display_name)).toEqual(["Çok Satan", "Az Satan"]);
  });

  it("ignores gifted quantities entirely", () => {
    const groups = groupSoldByUnit([
      row("a", "A", { unit_label: "kg", quantity: 5 }, [{ unit_label: "gr", quantity: 9999 }]),
    ]);
    expect(groups).toEqual([{ unit_label: "kg", rows: [{ product_key: "a", display_name: "A", quantity: 5 }] }]);
  });
});

describe("groupGiftedByUnit", () => {
  it("returns nothing when nothing was gifted", () => {
    expect(groupGiftedByUnit([row("a", "A", { unit_label: "kg", quantity: 1 })])).toEqual([]);
  });

  it("puts one product's two gift units into two separate groups, not summed", () => {
    const groups = groupGiftedByUnit([
      row("peynir", "Peynir", null, [
        { unit_label: "gr", quantity: 50 },
        { unit_label: "adet", quantity: 1 },
      ]),
    ]);
    expect(groups).toHaveLength(2);
    const grGroup = groups.find((g) => g.unit_label === "gr");
    const adetGroup = groups.find((g) => g.unit_label === "adet");
    expect(grGroup?.rows).toEqual([{ product_key: "peynir", display_name: "Peynir", quantity: 50 }]);
    expect(adetGroup?.rows).toEqual([{ product_key: "peynir", display_name: "Peynir", quantity: 1 }]);
  });
});

describe("parsePiecesPerUnit", () => {
  it("extracts the piece count from 'paket (15 adet)'", () => {
    expect(parsePiecesPerUnit("paket (15 adet)")).toBe(15);
  });

  it("is case-insensitive", () => {
    expect(parsePiecesPerUnit("Paket (24 ADET)")).toBe(24);
  });

  it("returns null for a plain kg/litre label", () => {
    expect(parsePiecesPerUnit("kg")).toBeNull();
    expect(parsePiecesPerUnit("litre")).toBeNull();
  });

  it("returns null for a parenthesized label that isn't a piece count (e.g. a jar's weight)", () => {
    expect(parsePiecesPerUnit("Kavanoz (930gr)")).toBeNull();
  });

  it("returns null for a bare number label (data-quality artifact, not a real unit)", () => {
    expect(parsePiecesPerUnit("1")).toBeNull();
  });
});

describe("monthly product tally", () => {
  it("covers whole months, including a leap February", () => {
    expect(monthRangeDays("2028-01", "2028-02")).toEqual({ from: "2028-01-01", to: "2028-02-29" });
    expect(monthRangeDays("2026-11", "2026-12")).toEqual({ from: "2026-11-01", to: "2026-12-31" });
  });

  it("lists every month in range, folding each like a single-range tally", () => {
    const months = buildMonthlyProductTally("2026-11", "2027-01", [
      { month: "2026-11-01", product_key: "eggs", display_name: "Yumurta", kind: "sold", unit_label: "paket", quantity: 40 },
      { month: "2026-11-01", product_key: "eggs", display_name: "Yumurta", kind: "gift", unit_label: "paket", quantity: 2 },
      { month: "2027-01-01", product_key: "milk", display_name: "Süt", kind: "sold", unit_label: "lt", quantity: 12 },
    ]);
    expect(months.map((m) => m.month)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(months[0]?.products).toEqual([
      {
        product_key: "eggs",
        display_name: "Yumurta",
        sold: { unit_label: "paket", quantity: 40 },
        gifted: [{ unit_label: "paket", quantity: 2 }],
      },
    ]);
    expect(months[1]?.products).toEqual([]);
    expect(months[2]?.products[0]?.sold).toEqual({ unit_label: "lt", quantity: 12 });
  });

  it("caps the range at 24 months and keeps from <= to", () => {
    expect(monthSpan("2025-01", "2026-12")).toBe(24);
    const ok = productTallyByMonthQuerySchema.safeParse({ from_month: "2025-01", to_month: "2026-12" });
    const tooLong = productTallyByMonthQuerySchema.safeParse({ from_month: "2025-01", to_month: "2027-01" });
    const reversed = productTallyByMonthQuerySchema.safeParse({ from_month: "2026-05", to_month: "2026-04" });
    const badMonth = productTallyByMonthQuerySchema.safeParse({ from_month: "2026-13", to_month: "2026-13" });
    expect(ok.success).toBe(true);
    expect(tooLong.success).toBe(false);
    expect(reversed.success).toBe(false);
    expect(badMonth.success).toBe(false);
  });
});
