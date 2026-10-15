import { describe, expect, it } from "vitest";
import { mapProductRows } from "@/features/products/infrastructure/product.mapper";

const row = {
  key: "eggs",
  display_name: "Köy Yumurtası",
  web_slug: "koy-yumurtasi",
  unit: "package",
  unit_label: "paket",
  package_size: "15",
  min_qty: "1",
  step: "1",
  fulfillment_type: "delivery",
  is_web_visible: true,
  is_featured: false,
  web_description: null,
  image_path: null,
  image_alt: null,
  current_unit_price_minor: "12500",
  active: true,
  sort_order: 0,
};

describe("product row mapping", () => {
  it("validates and maps the independent URL without altering the permanent key", () => {
    const result = mapProductRows(
      [row],
      new Map([
        [
          "eggs",
          [
            { min_qty: 3, unit_price_minor: 11000 },
            { min_qty: 1, unit_price_minor: 12500 },
          ],
        ],
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toMatchObject({
      key: "eggs",
      web_slug: "koy-yumurtasi",
      package_size: 15,
      current_unit_price_minor: 12500,
      total_quantity_sold: 0,
    });
    expect(result.value[0]?.price_tiers.map((tier) => tier.min_qty)).toEqual([
      1, 3,
    ]);
  });
  it("preserves a nullable URL for legacy inserts", () => {
    const result = mapProductRows([{ ...row, web_slug: null }], new Map());
    expect(result.ok && result.value[0]?.web_slug).toBe(null);
  });
  it("rejects invalid database slugs at the boundary", () => {
    expect(
      mapProductRows([{ ...row, web_slug: "Yumurta?" }], new Map()).ok,
    ).toBe(false);
  });
});
