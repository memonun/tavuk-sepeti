import { describe, expect, it } from "vitest";

import { buildGoogleMapsDirectionsUrl } from "@/features/routing/domain/google-maps-directions-url";

import type { OptimizedRoute, RouteStop } from "@/features/routing/domain/route";

const origin = { lat: 38.35, lng: 38.3 };

function stop(id: string, lat: number, lng: number): RouteStop {
  return {
    sequence: 1,
    order_id: id,
    order_number: id,
    customer_id: id,
    customer_name: "Ada Yıldız",
    customer_phone: null,
    customer_notes: null,
    lat,
    lng,
    delivery_address: null,
    delivery_street: null,
    building_no: null,
    apartment_no: null,
    in_service_area: true,
    delivery_notes: null,
    total_minor: 0,
    amount_paid_minor: 0,
    items: [],
    leg_distance_m: null,
    leg_duration_s: null,
    cumulative_distance_m: 0,
    cumulative_duration_s: 0,
    eta_iso: "2026-08-19T05:00:00.000Z",
  };
}

function route(overrides: Partial<OptimizedRoute>): OptimizedRoute {
  return {
    date: "2026-08-19",
    origin,
    destination: null,
    stops: [stop("o1", 38.4, 38.31), stop("o2", 38.41, 38.32)],
    completed_markers: [],
    overview_polyline: "",
    step_polylines: [],
    start_time_iso: "2026-08-19T01:00:00.000Z",
    finish_time_iso: "2026-08-19T02:00:00.000Z",
    total_distance_m: 0,
    total_duration_s: 0,
    ...overrides,
  };
}

describe("buildGoogleMapsDirectionsUrl", () => {
  it("round trip: destination = origin, every stop is a waypoint", () => {
    const url = buildGoogleMapsDirectionsUrl(route({}));
    const params = new URL(url).searchParams;
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?/);
    expect(params.get("origin")).toBe("38.35,38.3");
    expect(params.get("destination")).toBe("38.35,38.3");
    expect(params.get("waypoints")).toBe("38.4,38.31|38.41,38.32");
    expect(params.get("travelmode")).toBe("driving");
  });

  it("location destination: every stop stays a waypoint", () => {
    const url = buildGoogleMapsDirectionsUrl(
      route({
        destination: { kind: "location", lat: 38.5, lng: 38.5, name: "Depo" },
      }),
    );
    const params = new URL(url).searchParams;
    expect(params.get("destination")).toBe("38.5,38.5");
    expect(params.get("waypoints")).toBe("38.4,38.31|38.41,38.32");
  });

  it("order destination: last stop becomes the destination, not a waypoint too", () => {
    const url = buildGoogleMapsDirectionsUrl(
      route({
        destination: { kind: "order", lat: 38.41, lng: 38.32, name: "Ada", order_id: "o2" },
      }),
    );
    const params = new URL(url).searchParams;
    expect(params.get("destination")).toBe("38.41,38.32");
    expect(params.get("waypoints")).toBe("38.4,38.31");
  });

  it("single-stop order destination: no waypoints param at all", () => {
    const url = buildGoogleMapsDirectionsUrl(
      route({
        stops: [stop("o1", 38.4, 38.31)],
        destination: { kind: "order", lat: 38.4, lng: 38.31, name: "Ada", order_id: "o1" },
      }),
    );
    const params = new URL(url).searchParams;
    expect(params.has("waypoints")).toBe(false);
  });
});
