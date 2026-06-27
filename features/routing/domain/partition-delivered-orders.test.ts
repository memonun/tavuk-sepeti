import { describe, expect, it } from "vitest";

import {
  partitionDeliveredOrders,
  type DeliveredPartitionCandidate,
} from "@/features/routing/domain/partition-delivered-orders";

function order(
  id: string,
  lat: number,
  lng: number,
  first = "Ada",
  last = "Yıldız",
): DeliveredPartitionCandidate {
  return {
    order_id: id,
    order_number: `TS-${id}`,
    lat,
    lng,
    customer_first_name: first,
    customer_last_name: last,
  };
}

const orders = [
  order("o1", 41.1, 29.1),
  order("o2", 41.2, 29.2, "Mert", "Kaya"),
  order("o3", 41.3, 29.3),
];

describe("partitionDeliveredOrders", () => {
  it("routes every order and yields no markers when the exclude set is empty", () => {
    const { routed, completedMarkers } = partitionDeliveredOrders(orders, []);
    expect(routed).toHaveLength(3);
    expect(routed.map((o) => o.order_id)).toEqual(["o1", "o2", "o3"]);
    expect(completedMarkers).toHaveLength(0);
  });

  it("pulls excluded orders out of the routed set and into markers", () => {
    const { routed, completedMarkers } = partitionDeliveredOrders(orders, [
      "o2",
    ]);
    expect(routed.map((o) => o.order_id)).toEqual(["o1", "o3"]);
    expect(completedMarkers).toEqual([
      {
        order_id: "o2",
        order_number: "TS-o2",
        customer_name: "Mert Kaya",
        lat: 41.2,
        lng: 29.2,
      },
    ]);
  });

  it("preserves input order in both partitions", () => {
    const { routed, completedMarkers } = partitionDeliveredOrders(orders, [
      "o1",
      "o3",
    ]);
    expect(routed.map((o) => o.order_id)).toEqual(["o2"]);
    expect(completedMarkers.map((m) => m.order_id)).toEqual(["o1", "o3"]);
  });

  it("ignores exclude ids that aren't in the day's orders (stale URL)", () => {
    const { routed, completedMarkers } = partitionDeliveredOrders(orders, [
      "missing",
    ]);
    expect(routed).toHaveLength(3);
    expect(completedMarkers).toHaveLength(0);
  });

  it("trims the composed customer name", () => {
    const [{ completedMarkers }] = [
      partitionDeliveredOrders([order("o9", 1, 2, "Solo", "")], ["o9"]),
    ];
    expect(completedMarkers[0]?.customer_name).toBe("Solo");
  });

  it("accepts a Set as the exclude source", () => {
    const { routed } = partitionDeliveredOrders(orders, new Set(["o2"]));
    expect(routed.map((o) => o.order_id)).toEqual(["o1", "o3"]);
  });
});
