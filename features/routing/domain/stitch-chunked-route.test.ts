import { describe, expect, it } from "vitest";

import { stitchChunkedRoute } from "@/features/routing/domain/stitch-chunked-route";

describe("stitchChunkedRoute", () => {
  it("single chunk, no reordering, no appendItem: matches a plain one-shot call", () => {
    const stops = stitchChunkedRoute(
      [{ intermediates: ["a", "b"], handoffStop: null }],
      [
        {
          waypointOrder: [0, 1],
          legs: [
            { distanceM: 1000, durationS: 60 },
            { distanceM: 2000, durationS: 120 },
          ],
        },
      ],
      null,
    );
    expect(stops).toEqual([
      { item: "a", legDistanceM: 1000, legDurationS: 60, cumulativeDistanceM: 1000, cumulativeDurationS: 60 },
      { item: "b", legDistanceM: 2000, legDurationS: 120, cumulativeDistanceM: 3000, cumulativeDurationS: 180 },
    ]);
  });

  it("single chunk respects Google's reordering (waypointOrder), not input order", () => {
    const stops = stitchChunkedRoute(
      [{ intermediates: ["a", "b", "c"], handoffStop: null }],
      [
        {
          waypointOrder: [2, 0, 1],
          legs: [
            { distanceM: 100, durationS: 10 },
            { distanceM: 200, durationS: 20 },
            { distanceM: 300, durationS: 30 },
          ],
        },
      ],
      null,
    );
    expect(stops.map((s) => s.item)).toEqual(["c", "a", "b"]);
    expect(stops[2]).toEqual({
      item: "b",
      legDistanceM: 300,
      legDurationS: 30,
      cumulativeDistanceM: 600,
      cumulativeDurationS: 60,
    });
  });

  it("two chunks: handoff stop is recorded once, cumulative totals continue across the boundary", () => {
    const stops = stitchChunkedRoute(
      [
        { intermediates: ["a", "b"], handoffStop: "handoff" },
        { intermediates: ["c"], handoffStop: null },
      ],
      [
        {
          // 2 intermediates + the forced destination (handoff) = 3 legs.
          waypointOrder: [0, 1],
          legs: [
            { distanceM: 100, durationS: 10 },
            { distanceM: 100, durationS: 10 },
            { distanceM: 100, durationS: 10 }, // b -> handoff
          ],
        },
        {
          // origin (= handoff) -> c.
          waypointOrder: [0],
          legs: [{ distanceM: 50, durationS: 5 }],
        },
      ],
      null,
    );
    expect(stops.map((s) => s.item)).toEqual(["a", "b", "handoff", "c"]);
    // handoff's cumulative: 100+100+100 = 300m, 30s.
    expect(stops[2]).toMatchObject({ cumulativeDistanceM: 300, cumulativeDurationS: 30 });
    // c continues from there: 300+50 = 350m, 35s — not reset at the chunk boundary.
    expect(stops[3]).toMatchObject({ cumulativeDistanceM: 350, cumulativeDurationS: 35 });
  });

  it("appends the pinned order-destination as the final stop, using the last chunk's final leg", () => {
    const stops = stitchChunkedRoute(
      [{ intermediates: ["a"], handoffStop: null }],
      [
        {
          waypointOrder: [0],
          legs: [
            { distanceM: 100, durationS: 10 }, // origin -> a
            { distanceM: 200, durationS: 20 }, // a -> pinned destination
          ],
        },
      ],
      "pinned",
    );
    expect(stops.map((s) => s.item)).toEqual(["a", "pinned"]);
    expect(stops[1]).toEqual({
      item: "pinned",
      legDistanceM: 200,
      legDurationS: 20,
      cumulativeDistanceM: 300,
      cumulativeDurationS: 30,
    });
  });

  it("a chunk with zero intermediates (all stops already consumed by prior handoffs) contributes nothing but its appendItem", () => {
    const stops = stitchChunkedRoute(
      [
        { intermediates: ["a"], handoffStop: "handoff" },
        { intermediates: [], handoffStop: null },
      ],
      [
        { waypointOrder: [0], legs: [{ distanceM: 10, durationS: 1 }, { distanceM: 10, durationS: 1 }] },
        { waypointOrder: [], legs: [{ distanceM: 5, durationS: 1 }] },
      ],
      "pinned",
    );
    expect(stops.map((s) => s.item)).toEqual(["a", "handoff", "pinned"]);
  });

  it("treats a missing leg as zero distance/duration but still null on the stop", () => {
    const stops = stitchChunkedRoute(
      [{ intermediates: ["a"], handoffStop: null }],
      [{ waypointOrder: [0], legs: [] }],
      null,
    );
    expect(stops).toEqual([
      { item: "a", legDistanceM: null, legDurationS: null, cumulativeDistanceM: 0, cumulativeDurationS: 0 },
    ]);
  });

  it("throws on an out-of-range waypointOrder index (programmer/API contract error)", () => {
    expect(() =>
      stitchChunkedRoute(
        [{ intermediates: ["a"], handoffStop: null }],
        [{ waypointOrder: [5], legs: [] }],
        null,
      ),
    ).toThrow(/out of range/);
  });
});
