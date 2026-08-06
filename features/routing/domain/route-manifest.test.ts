import { describe, expect, it } from "vitest";

import { computeRouteManifest } from "@/features/routing/domain/route-manifest";
import type { RouteStop, RouteStopItem } from "@/features/routing/domain/route";

function item(overrides: Partial<RouteStopItem> = {}): RouteStopItem {
  return {
    label: "Yumurta",
    unit_label: "paket",
    quantity: 1,
    unit_price_minor: 12500,
    line_total_minor: 12500,
    ...overrides,
  };
}

function stop(overrides: Partial<RouteStop> = {}): RouteStop {
  return {
    sequence: 1,
    order_id: "o1",
    order_number: "ORD-1",
    customer_id: "c1",
    customer_name: "Ayşe",
    customer_phone: null,
    customer_notes: null,
    lat: 0,
    lng: 0,
    delivery_address: null,
    delivery_street: null,
    building_no: null,
    apartment_no: null,
    in_service_area: null,
    delivery_notes: null,
    total_minor: 0,
    amount_paid_minor: 0,
    items: [],
    leg_distance_m: null,
    leg_duration_s: null,
    cumulative_distance_m: 0,
    cumulative_duration_s: 0,
    eta_iso: "2026-06-25T07:00:00.000Z",
    ...overrides,
  };
}

describe("computeRouteManifest", () => {
  it("returns empty totals for no stops", () => {
    const m = computeRouteManifest([]);
    expect(m.loads).toEqual([]);
    expect(m.stopCount).toBe(0);
    expect(m.toCollectMinor).toBe(0);
  });

  it("sums the same product across stops and lists distinct products", () => {
    const m = computeRouteManifest([
      stop({ order_id: "o1", items: [item({ label: "Yumurta", quantity: 3 })] }),
      stop({
        order_id: "o2",
        items: [
          item({ label: "Yumurta", quantity: 2 }),
          item({ label: "Süt", unit_label: "lt", quantity: 4 }),
        ],
      }),
    ]);
    const eggs = m.loads.find((l) => l.label === "Yumurta")!;
    const milk = m.loads.find((l) => l.label === "Süt")!;
    expect(eggs.quantity).toBe(5); // 3 + 2
    expect(eggs.unit_label).toBe("paket");
    expect(milk.quantity).toBe(4);
  });

  it("keeps same-name products with different units as separate lines", () => {
    const m = computeRouteManifest([
      stop({ items: [item({ label: "Peynir", unit_label: "kg", quantity: 1 })] }),
      stop({ order_id: "o2", items: [item({ label: "Peynir", unit_label: "paket", quantity: 2 })] }),
    ]);
    expect(m.loads.filter((l) => l.label === "Peynir")).toHaveLength(2);
  });

  it("sorts product lines by label (tr locale), deterministically", () => {
    const m = computeRouteManifest([
      stop({
        items: [
          item({ label: "Süt", unit_label: "lt", quantity: 1 }),
          item({ label: "Peynir", unit_label: "kg", quantity: 1 }),
          item({ label: "Yumurta", quantity: 1 }),
        ],
      }),
    ]);
    expect(m.loads.map((l) => l.label)).toEqual(["Peynir", "Süt", "Yumurta"]);
  });

  it("remainingLoads/counts exclude delivered stops", () => {
    const stops = [
      stop({ order_id: "o1", items: [item({ label: "Yumurta", quantity: 3 })] }),
      stop({ order_id: "o2", items: [item({ label: "Süt", unit_label: "lt", quantity: 4 })] }),
    ];
    const m = computeRouteManifest(stops, ["o1"]);
    expect(m.deliveredCount).toBe(1);
    expect(m.remainingCount).toBe(1);
    expect(m.remainingLoads).toEqual([{ label: "Süt", unit_label: "lt", quantity: 4 }]);
    // total loads still reflect everything
    expect(m.loads.map((l) => l.label).sort()).toEqual(["Süt", "Yumurta"]);
  });

  it("toCollect counts only undelivered unpaid balances; collected/total span all", () => {
    const stops = [
      stop({ order_id: "o1", total_minor: 10000, amount_paid_minor: 10000 }), // delivered + paid
      stop({ order_id: "o2", total_minor: 8000, amount_paid_minor: 3000 }), // remaining, 5000 due
      stop({ order_id: "o3", total_minor: 5000, amount_paid_minor: 0 }), // remaining, 5000 due
    ];
    const m = computeRouteManifest(stops, ["o1"]);
    expect(m.totalValueMinor).toBe(23000);
    expect(m.collectedMinor).toBe(13000);
    expect(m.toCollectMinor).toBe(10000); // 5000 + 5000, o1 excluded
  });
});
