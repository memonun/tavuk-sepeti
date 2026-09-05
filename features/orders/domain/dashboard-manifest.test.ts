import { describe, expect, it } from "vitest";

import { computeDashboardManifest } from "@/features/orders/domain/dashboard-manifest";

describe("computeDashboardManifest", () => {
  it("returns an empty manifest for no orders", () => {
    const manifest = computeDashboardManifest([], []);
    expect(manifest.lines).toEqual([]);
    expect(manifest.route).toEqual({ orderCount: 0, totalValueMinor: 0, toCollectMinor: 0 });
    expect(manifest.cargo).toEqual({ orderCount: 0, totalValueMinor: 0, toCollectMinor: 0 });
    expect(manifest.routeOrders).toEqual([]);
    expect(manifest.cargoOrders).toEqual([]);
  });

  it("sums quantities for the same product + unit across both route and cargo orders, keeping the split", () => {
    const manifest = computeDashboardManifest(
      [
        {
          order_id: "r1",
          order_number: "TS-001",
          customer_name: "Ahmet Yılmaz",
          total_minor: 10000,
          amount_paid_minor: 0,
          items: [{ label: "Yumurta", unit_label: "paket", quantity: 2 }],
        },
      ],
      [
        {
          order_id: "c1",
          order_number: "TS-002",
          customer_name: "Ayşe Kaya",
          total_minor: 15000,
          amount_paid_minor: 0,
          items: [{ label: "Yumurta", unit_label: "paket", quantity: 3 }],
        },
      ],
    );
    expect(manifest.lines).toEqual([
      {
        label: "Yumurta",
        unit_label: "paket",
        quantity: 5,
        routeQuantity: 2,
        cargoQuantity: 3,
      },
    ]);
  });

  it("reports a product that's only in one channel with a zero on the other side", () => {
    const manifest = computeDashboardManifest(
      [
        {
          order_id: "r1",
          order_number: "TS-001",
          customer_name: "Ahmet Yılmaz",
          total_minor: 5000,
          amount_paid_minor: 0,
          items: [{ label: "Süt", unit_label: "litre", quantity: 4 }],
        },
      ],
      [],
    );
    expect(manifest.lines).toEqual([
      {
        label: "Süt",
        unit_label: "litre",
        quantity: 4,
        routeQuantity: 4,
        cargoQuantity: 0,
      },
    ]);
  });

  it("keeps different products (or different units of the same product) as separate lines", () => {
    const manifest = computeDashboardManifest(
      [
        {
          order_id: "r1",
          order_number: "TS-001",
          customer_name: "Ahmet Yılmaz",
          total_minor: 5000,
          amount_paid_minor: 0,
          items: [
            { label: "Kuru Kayısı", unit_label: "kg", quantity: 1 },
            { label: "Kuru Kayısı", unit_label: "paket", quantity: 1 },
          ],
        },
      ],
      [],
    );
    expect(manifest.lines).toHaveLength(2);
  });

  it("sorts lines alphabetically (Turkish locale)", () => {
    const manifest = computeDashboardManifest(
      [],
      [
        {
          order_id: "c1",
          order_number: "TS-002",
          customer_name: "Ayşe Kaya",
          total_minor: 1000,
          amount_paid_minor: 0,
          items: [
            { label: "Ceviz", unit_label: "kg", quantity: 1 },
            { label: "Ayva", unit_label: "kg", quantity: 1 },
          ],
        },
      ],
    );
    expect(manifest.lines.map((l) => l.label)).toEqual(["Ayva", "Ceviz"]);
  });

  it("keeps route and cargo counts/money in separate buckets — a stale cargo order never inflates today's route figures", () => {
    const manifest = computeDashboardManifest(
      [
        {
          order_id: "r1",
          order_number: "TS-001",
          customer_name: "Ahmet Yılmaz",
          total_minor: 10000,
          amount_paid_minor: 0,
          items: [],
        },
        {
          order_id: "r2",
          order_number: "TS-002",
          customer_name: "Ayşe Kaya",
          total_minor: 8000,
          amount_paid_minor: 8000,
          items: [],
        },
      ],
      [
        {
          order_id: "c1",
          order_number: "TS-003",
          customer_name: "Mehmet Demir",
          total_minor: 6000,
          amount_paid_minor: 2000,
          items: [],
        },
      ],
    );
    expect(manifest.route).toEqual({
      orderCount: 2,
      totalValueMinor: 18000,
      toCollectMinor: 10000,
    });
    expect(manifest.cargo).toEqual({
      orderCount: 1,
      totalValueMinor: 6000,
      toCollectMinor: 4000,
    });
  });

  it("passes the individual orders through unchanged, per scope, for the list panels", () => {
    const routeOrder = {
      order_id: "r1",
      order_number: "TS-001",
      customer_name: "Ahmet Yılmaz",
      total_minor: 10000,
      amount_paid_minor: 0,
      items: [],
    };
    const cargoOrder = {
      order_id: "c1",
      order_number: "TS-002",
      customer_name: "Ayşe Kaya",
      total_minor: 6000,
      amount_paid_minor: 2000,
      items: [],
    };
    const manifest = computeDashboardManifest([routeOrder], [cargoOrder]);
    expect(manifest.routeOrders).toEqual([routeOrder]);
    expect(manifest.cargoOrders).toEqual([cargoOrder]);
  });

  it("never lets an overpayment turn the outstanding balance negative", () => {
    const manifest = computeDashboardManifest(
      [
        {
          order_id: "r1",
          order_number: "TS-001",
          customer_name: "Ahmet Yılmaz",
          total_minor: 5000,
          amount_paid_minor: 6000,
          items: [],
        },
      ],
      [],
    );
    expect(manifest.route.toCollectMinor).toBe(0);
  });

  it("ignores orders with no items for the product lines, but still counts them", () => {
    const manifest = computeDashboardManifest(
      [
        {
          order_id: "r1",
          order_number: "TS-001",
          customer_name: "Ahmet Yılmaz",
          total_minor: 0,
          amount_paid_minor: 0,
          items: [],
        },
      ],
      [],
    );
    expect(manifest.lines).toEqual([]);
    expect(manifest.route.orderCount).toBe(1);
  });
});
