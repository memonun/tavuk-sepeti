import { describe, expect, it } from "vitest";

import {
  resolveRouteDestination,
  type RouteDestinationCandidate,
} from "@/features/routing/domain/route-destination";

const origin = { lat: 41.0, lng: 29.0 };

function order(
  id: string,
  lat: number,
  lng: number,
  first = "Ada",
  last = "Yıldız",
): RouteDestinationCandidate {
  return {
    order_id: id,
    lat,
    lng,
    customer_first_name: first,
    customer_last_name: last,
  };
}

const orders = [
  order("o1", 41.1, 29.1),
  order("o2", 41.2, 29.2),
  order("o3", 41.3, 29.3, "Mert", "Kaya"),
];

describe("resolveRouteDestination", () => {
  it("defaults to a round trip when no option is given", () => {
    const r = resolveRouteDestination(orders, origin, undefined);
    expect(r.destCoord).toEqual(origin);
    expect(r.waypointOrders).toHaveLength(3);
    expect(r.appendStop).toBeNull();
    expect(r.routeDestination).toBeNull();
  });

  it("ends at a saved location without removing any waypoint", () => {
    const r = resolveRouteDestination(orders, origin, {
      kind: "location",
      lat: 40.9,
      lng: 28.8,
      name: "Ev",
    });
    expect(r.destCoord).toEqual({ lat: 40.9, lng: 28.8 });
    expect(r.waypointOrders).toHaveLength(3);
    expect(r.appendStop).toBeNull();
    expect(r.routeDestination).toEqual({
      kind: "location",
      lat: 40.9,
      lng: 28.8,
      name: "Ev",
    });
  });

  it("pins an order as the final stop and pulls it out of the waypoints", () => {
    const r = resolveRouteDestination(orders, origin, {
      kind: "order",
      orderId: "o2",
    });
    expect(r.destCoord).toEqual({ lat: 41.2, lng: 29.2 });
    expect(r.waypointOrders.map((o) => o.order_id)).toEqual(["o1", "o3"]);
    expect(r.appendStop?.order_id).toBe("o2");
    expect(r.routeDestination).toEqual({
      kind: "order",
      lat: 41.2,
      lng: 29.2,
      name: "Ada Yıldız",
      order_id: "o2",
    });
  });

  it("falls back to a round trip when the chosen order isn't in the day", () => {
    const r = resolveRouteDestination(orders, origin, {
      kind: "order",
      orderId: "missing",
    });
    expect(r.destCoord).toEqual(origin);
    expect(r.waypointOrders).toHaveLength(3);
    expect(r.appendStop).toBeNull();
    expect(r.routeDestination).toBeNull();
  });

  it("handles the only order being the destination (empty waypoints)", () => {
    const single = [order("solo", 41.5, 29.5)];
    const r = resolveRouteDestination(single, origin, {
      kind: "order",
      orderId: "solo",
    });
    expect(r.waypointOrders).toHaveLength(0);
    expect(r.appendStop?.order_id).toBe("solo");
    expect(r.routeDestination?.kind).toBe("order");
  });
});
