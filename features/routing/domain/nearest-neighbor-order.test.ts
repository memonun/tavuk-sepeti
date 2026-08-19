import { describe, expect, it } from "vitest";

import { nearestNeighborOrder } from "@/features/routing/domain/nearest-neighbor-order";

describe("nearestNeighborOrder", () => {
  it("returns an empty array for no stops", () => {
    expect(nearestNeighborOrder({ lat: 0, lng: 0 }, [])).toEqual([]);
  });

  it("keeps a single stop as-is", () => {
    const stop = { lat: 1, lng: 1 };
    expect(nearestNeighborOrder({ lat: 0, lng: 0 }, [stop])).toEqual([stop]);
  });

  it("always visits the closest remaining stop next", () => {
    // Three stops on a line east of the origin: far, near, mid. Greedy
    // nearest-neighbor from the origin must visit near, then mid, then far —
    // never mid before near, since near is always closer once reached.
    const near = { lat: 0, lng: 1, id: "near" };
    const mid = { lat: 0, lng: 2, id: "mid" };
    const far = { lat: 0, lng: 3, id: "far" };
    const ordered = nearestNeighborOrder({ lat: 0, lng: 0 }, [far, near, mid]);
    expect(ordered.map((s) => s.id)).toEqual(["near", "mid", "far"]);
  });

  it("is a permutation of the input — same length, same elements", () => {
    const stops = [
      { lat: 38.4, lng: 38.1, id: "a" },
      { lat: 38.2, lng: 38.5, id: "b" },
      { lat: 38.9, lng: 38.3, id: "c" },
      { lat: 38.35, lng: 38.28, id: "d" },
    ];
    const ordered = nearestNeighborOrder({ lat: 38.38, lng: 38.07 }, stops);
    expect(ordered).toHaveLength(stops.length);
    expect(new Set(ordered.map((s) => s.id))).toEqual(new Set(stops.map((s) => s.id)));
  });

  it("does not mutate the input array", () => {
    const stops = [
      { lat: 0, lng: 1 },
      { lat: 0, lng: 2 },
    ];
    const copy = [...stops];
    nearestNeighborOrder({ lat: 0, lng: 0 }, stops);
    expect(stops).toEqual(copy);
  });
});
