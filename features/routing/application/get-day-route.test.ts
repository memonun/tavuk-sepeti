/**
 * `persistEtas` decides whether computing a route also rewrites
 * `orders.estimated_delivery_at` — the delivery time customers see. The panel
 * keeps doing it (default); read-only callers must be able to opt out.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ok } from "@/shared/result";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/env", () => ({ env: { WAREHOUSE_LAT: 41, WAREHOUSE_LNG: 29 } }));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const order = {
  order_id: "o1",
  order_number: "ORD-1",
  status: "confirmed",
  scheduled_for: "2026-10-08",
  time_slot: null,
  customer_id: "c1",
  customer_first_name: "Ayşe",
  customer_last_name: "Yılmaz",
  customer_phone: null,
  lat: 38.3,
  lng: 38.3,
  street: null,
  building_no: null,
  apartment_no: null,
  in_service_area: null,
  delivery_notes: null,
  total_minor: 1000,
};

const persistStopEtas = vi.fn();
const callGoogleDirections = vi.fn();
vi.mock("@/features/routing/application/get-day-orders", () => ({
  getDayOrders: async () => ok([order]),
}));
vi.mock("@/features/routing/infrastructure/google-directions", () => ({
  callGoogleDirections: (...a: unknown[]) => callGoogleDirections(...a),
}));
vi.mock("@/features/routing/infrastructure/order-delivery-details", () => ({
  fetchDeliveryDetails: async () => new Map(),
}));
vi.mock("@/features/routing/infrastructure/order-eta.repository", () => ({
  persistStopEtas: (...a: unknown[]) => persistStopEtas(...a),
}));
vi.mock("@/features/routing/infrastructure/saved-location.repository", () => ({
  getDefaultSavedLocation: async () => null,
}));
vi.mock("@/features/routing/domain/stitch-chunked-route", () => ({
  stitchChunkedRoute: () => [
    { item: order, legDistanceM: 1000, legDurationS: 60, cumulativeDistanceM: 1000, cumulativeDurationS: 60 },
  ],
}));

const { getDayRoute } = await import("@/features/routing/application/get-day-route");

describe("getDayRoute persistEtas", () => {
  beforeEach(() => {
    persistStopEtas.mockReset();
    callGoogleDirections.mockReset();
    callGoogleDirections.mockResolvedValue(
      ok({ legs: [{ distanceM: 1000, durationS: 60 }], overviewPolyline: "x", stepPolylines: [], waypointOrder: [0] }),
    );
  });

  it("writes the stop ETAs by default (panel behaviour unchanged)", async () => {
    const res = await getDayRoute("2026-10-08");
    expect(res.ok).toBe(true);
    expect(persistStopEtas).toHaveBeenCalledTimes(1);
    expect(persistStopEtas.mock.calls[0]?.[0]).toEqual([
      { order_id: "o1", eta_iso: expect.any(String) },
    ]);
  });

  it("writes nothing when persistEtas is false, but still returns the route", async () => {
    const res = await getDayRoute("2026-10-08", { persistEtas: false });
    expect(res.ok && res.value.stops).toHaveLength(1);
    expect(persistStopEtas).not.toHaveBeenCalled();
  });
});
