import { describe, expect, it } from "vitest";

import { buildProductTallyRows } from "@/features/finance/domain/product-tally";

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
