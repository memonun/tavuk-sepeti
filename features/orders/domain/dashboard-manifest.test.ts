import { describe, expect, it } from "vitest";

import { computeDashboardManifest } from "@/features/orders/domain/dashboard-manifest";

describe("computeDashboardManifest", () => {
  it("returns an empty manifest for no orders", () => {
    const manifest = computeDashboardManifest([]);
    expect(manifest.lines).toEqual([]);
    expect(manifest.orderCount).toBe(0);
    expect(manifest.totalValueMinor).toBe(0);
    expect(manifest.toCollectMinor).toBe(0);
  });

  it("sums quantities for the same product + unit across orders", () => {
    const manifest = computeDashboardManifest([
      {
        order_id: "o1",
        total_minor: 10000,
        amount_paid_minor: 0,
        items: [{ label: "Yumurta", unit_label: "paket", quantity: 2 }],
      },
      {
        order_id: "o2",
        total_minor: 15000,
        amount_paid_minor: 0,
        items: [{ label: "Yumurta", unit_label: "paket", quantity: 3 }],
      },
    ]);
    expect(manifest.lines).toEqual([{ label: "Yumurta", unit_label: "paket", quantity: 5 }]);
    expect(manifest.orderCount).toBe(2);
    expect(manifest.totalValueMinor).toBe(25000);
  });

  it("keeps different products (or different units of the same product) as separate lines", () => {
    const manifest = computeDashboardManifest([
      {
        order_id: "o1",
        total_minor: 5000,
        amount_paid_minor: 0,
        items: [
          { label: "Kuru Kayısı", unit_label: "kg", quantity: 1 },
          { label: "Kuru Kayısı", unit_label: "paket", quantity: 1 },
        ],
      },
    ]);
    expect(manifest.lines).toHaveLength(2);
  });

  it("sorts lines alphabetically (Turkish locale)", () => {
    const manifest = computeDashboardManifest([
      {
        order_id: "o1",
        total_minor: 1000,
        amount_paid_minor: 0,
        items: [
          { label: "Ceviz", unit_label: "kg", quantity: 1 },
          { label: "Ayva", unit_label: "kg", quantity: 1 },
        ],
      },
    ]);
    expect(manifest.lines.map((l) => l.label)).toEqual(["Ayva", "Ceviz"]);
  });

  it("sums the outstanding balance only where the order isn't fully paid", () => {
    const manifest = computeDashboardManifest([
      { order_id: "o1", total_minor: 10000, amount_paid_minor: 0, items: [] },
      { order_id: "o2", total_minor: 8000, amount_paid_minor: 8000, items: [] },
      { order_id: "o3", total_minor: 6000, amount_paid_minor: 2000, items: [] },
    ]);
    expect(manifest.totalValueMinor).toBe(24000);
    expect(manifest.toCollectMinor).toBe(14000);
  });

  it("never lets an overpayment turn the outstanding balance negative", () => {
    const manifest = computeDashboardManifest([
      { order_id: "o1", total_minor: 5000, amount_paid_minor: 6000, items: [] },
    ]);
    expect(manifest.toCollectMinor).toBe(0);
  });

  it("ignores orders with no items for the product lines, but still counts them", () => {
    const manifest = computeDashboardManifest([
      { order_id: "o1", total_minor: 0, amount_paid_minor: 0, items: [] },
    ]);
    expect(manifest.lines).toEqual([]);
    expect(manifest.orderCount).toBe(1);
  });
});
