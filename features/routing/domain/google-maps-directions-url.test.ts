import { describe, expect, it } from "vitest";

import {
  GOOGLE_MAPS_MAX_WAYPOINTS,
  buildGoogleMapsDirectionsLegs,
} from "@/features/routing/domain/google-maps-directions-url";

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

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

function onlyLeg(r: OptimizedRoute) {
  const legs = buildGoogleMapsDirectionsLegs(r);
  expect(legs).toHaveLength(1);
  const [leg] = legs;
  if (!leg) throw new Error("no leg");
  return leg;
}

function manyStops(n: number): RouteStop[] {
  return Array.from({ length: n }, (_, i) => stop(`o${i + 1}`, 38 + i / 100, 38));
}

describe("buildGoogleMapsDirectionsLegs", () => {
  it("round trip: destination = origin, every stop is a waypoint", () => {
    const leg = onlyLeg(route({}));
    const p = params(leg.url);
    expect(leg.url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?/);
    expect(p.get("origin")).toBe("38.35,38.3");
    expect(p.get("destination")).toBe("38.35,38.3");
    expect(p.get("waypoints")).toBe("38.4,38.31|38.41,38.32");
    expect(p.get("travelmode")).toBe("driving");
    expect(leg).toMatchObject({ firstStop: 1, lastStop: 2, endsAtRouteEnd: true });
  });

  it("location destination: every stop stays a waypoint", () => {
    const leg = onlyLeg(
      route({
        destination: { kind: "location", lat: 38.5, lng: 38.5, name: "Depo" },
      }),
    );
    expect(params(leg.url).get("destination")).toBe("38.5,38.5");
    expect(params(leg.url).get("waypoints")).toBe("38.4,38.31|38.41,38.32");
  });

  it("order destination: last stop becomes the destination, not a waypoint too", () => {
    const leg = onlyLeg(
      route({
        destination: { kind: "order", lat: 38.41, lng: 38.32, name: "Ada", order_id: "o2" },
      }),
    );
    expect(params(leg.url).get("destination")).toBe("38.41,38.32");
    expect(params(leg.url).get("waypoints")).toBe("38.4,38.31");
    expect(leg).toMatchObject({ firstStop: 1, lastStop: 2, endsAtRouteEnd: false });
  });

  it("single-stop order destination: no waypoints param at all", () => {
    const leg = onlyLeg(
      route({
        stops: [stop("o1", 38.4, 38.31)],
        destination: { kind: "order", lat: 38.4, lng: 38.31, name: "Ada", order_id: "o1" },
      }),
    );
    expect(params(leg.url).has("waypoints")).toBe(false);
  });

  it("9 stops round trip still fits in one link", () => {
    const leg = onlyLeg(route({ stops: manyStops(9) }));
    expect(params(leg.url).get("waypoints")?.split("|")).toHaveLength(9);
  });

  it("21 stops round trip: split into chained legs, none over the waypoint cap, no stop lost", () => {
    const stops = manyStops(21);
    const legs = buildGoogleMapsDirectionsLegs(route({ stops }));
    expect(legs).toHaveLength(3);

    const visited: string[] = [];
    let prevDestination = "38.35,38.3";
    for (const leg of legs) {
      const p = params(leg.url);
      const waypoints = p.get("waypoints")?.split("|") ?? [];
      expect(waypoints.length).toBeLessThanOrEqual(GOOGLE_MAPS_MAX_WAYPOINTS);
      // Each leg starts exactly where the previous one ended.
      expect(p.get("origin")).toBe(prevDestination);
      prevDestination = p.get("destination") ?? "";
      visited.push(...waypoints, prevDestination);
    }
    // Every stop in order, then back to the origin.
    expect(visited).toEqual([...stops.map((s) => `${s.lat},${s.lng}`), "38.35,38.3"]);
    expect(legs.map((l) => [l.firstStop, l.lastStop, l.endsAtRouteEnd])).toEqual([
      [1, 8, false],
      [9, 15, false],
      [16, 21, true],
    ]);
  });

  it("10 stops round trip: balanced legs, no return-only tail", () => {
    const legs = buildGoogleMapsDirectionsLegs(route({ stops: manyStops(10) }));
    expect(legs.map((l) => [l.firstStop, l.lastStop, l.endsAtRouteEnd])).toEqual([
      [1, 6, false],
      [7, 10, true],
    ]);
  });

  it("21 stops ending at an order: last leg ends on the final stop", () => {
    const stops = manyStops(21);
    const last = stops[20];
    if (!last) throw new Error("no stop");
    const legs = buildGoogleMapsDirectionsLegs(
      route({
        stops,
        destination: { kind: "order", lat: last.lat, lng: last.lng, name: "Ada", order_id: "o21" },
      }),
    );
    expect(legs).toHaveLength(3);
    const final = legs[legs.length - 1];
    expect(final?.endsAtRouteEnd).toBe(false);
    expect(final?.lastStop).toBe(21);
    expect(params(final?.url ?? "").get("destination")).toBe(`${last.lat},${last.lng}`);
  });

  it("no stops: a single origin → destination leg", () => {
    const leg = onlyLeg(route({ stops: [] }));
    expect(leg).toMatchObject({ firstStop: null, lastStop: null, endsAtRouteEnd: true });
    expect(params(leg.url).has("waypoints")).toBe(false);
  });
});
