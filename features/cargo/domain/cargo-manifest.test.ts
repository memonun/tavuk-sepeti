import { describe, expect, it } from "vitest";

import { computeCargoManifest } from "@/features/cargo/domain/cargo-manifest";

describe("computeCargoManifest", () => {
  it("returns an empty manifest for no orders", () => {
    const manifest = computeCargoManifest([]);
    expect(manifest.lines).toEqual([]);
    expect(manifest.orderCount).toBe(0);
    expect(manifest.totalValueMinor).toBe(0);
  });

  it("sums quantities for the same product + unit across orders", () => {
    const manifest = computeCargoManifest([
      {
        order_id: "o1",
        total_minor: 10000,
        items: [{ label: "Kuru Kayısı", unit_label: "kg", quantity: 2 }],
      },
      {
        order_id: "o2",
        total_minor: 15000,
        items: [{ label: "Kuru Kayısı", unit_label: "kg", quantity: 3 }],
      },
    ]);
    expect(manifest.lines).toEqual([{ label: "Kuru Kayısı", unit_label: "kg", quantity: 5 }]);
    expect(manifest.orderCount).toBe(2);
    expect(manifest.totalValueMinor).toBe(25000);
  });

  it("keeps different products (or different units of the same product) as separate lines", () => {
    const manifest = computeCargoManifest([
      {
        order_id: "o1",
        total_minor: 5000,
        items: [
          { label: "Pekmez", unit_label: "kavanoz", quantity: 1 },
          { label: "Pekmez", unit_label: "kg", quantity: 1 },
        ],
      },
    ]);
    expect(manifest.lines).toHaveLength(2);
  });

  it("sorts lines alphabetically (Turkish locale)", () => {
    const manifest = computeCargoManifest([
      {
        order_id: "o1",
        total_minor: 1000,
        items: [
          { label: "Ceviz", unit_label: "kg", quantity: 1 },
          { label: "Ayva", unit_label: "kg", quantity: 1 },
        ],
      },
    ]);
    expect(manifest.lines.map((l) => l.label)).toEqual(["Ayva", "Ceviz"]);
  });

  it("ignores orders with no items", () => {
    const manifest = computeCargoManifest([
      { order_id: "o1", total_minor: 0, items: [] },
    ]);
    expect(manifest.lines).toEqual([]);
    expect(manifest.orderCount).toBe(1);
  });
});
