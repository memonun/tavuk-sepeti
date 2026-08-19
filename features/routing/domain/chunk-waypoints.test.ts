import { describe, expect, it } from "vitest";

import { planWaypointChunks } from "@/features/routing/domain/chunk-waypoints";

const origin = { lat: 0, lng: 0 };
const finalDestination = { lat: 99, lng: 99 };

function stops(n: number, offset = 0): Array<{ lat: number; lng: number; id: string }> {
  return Array.from({ length: n }, (_, i) => ({
    lat: i + offset,
    lng: i + offset,
    id: `s${i + offset}`,
  }));
}

describe("planWaypointChunks", () => {
  it("returns a single chunk shaped like a plain call when at or under the cap", () => {
    const s = stops(25);
    const chunks = planWaypointChunks(origin, s, finalDestination, 25);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({
      origin,
      intermediates: s,
      destination: finalDestination,
      handoffStop: null,
    });
  });

  it("handles zero stops as a single direct-route chunk", () => {
    const chunks = planWaypointChunks(origin, [], finalDestination, 25);
    expect(chunks).toEqual([
      { origin, intermediates: [], destination: finalDestination, handoffStop: null },
    ]);
  });

  it("splits 26 stops into a 25-intermediate chunk + a 0-intermediate final chunk", () => {
    const s = stops(26);
    const chunks = planWaypointChunks(origin, s, finalDestination, 25);
    expect(chunks).toHaveLength(2);

    expect(chunks[0]!.origin).toEqual(origin);
    expect(chunks[0]!.intermediates).toEqual(s.slice(0, 25));
    expect(chunks[0]!.destination).toEqual(s[25]);
    expect(chunks[0]!.handoffStop).toEqual(s[25]);

    expect(chunks[1]!.origin).toEqual(s[25]);
    expect(chunks[1]!.intermediates).toEqual([]);
    expect(chunks[1]!.destination).toEqual(finalDestination);
    expect(chunks[1]!.handoffStop).toBeNull();
  });

  it("every real stop appears exactly once across all chunks (as an intermediate or a handoff)", () => {
    const s = stops(63);
    const chunks = planWaypointChunks(origin, s, finalDestination, 25);
    const covered = chunks.flatMap((c) => [
      ...c.intermediates.map((i) => i.id),
      ...(c.handoffStop ? [c.handoffStop.id] : []),
    ]);
    expect(covered).toHaveLength(s.length);
    expect(new Set(covered)).toEqual(new Set(s.map((x) => x.id)));
  });

  it("chains each chunk's origin to the previous chunk's handoff stop", () => {
    const s = stops(52);
    const chunks = planWaypointChunks(origin, s, finalDestination, 25);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.origin).toEqual(origin);
    expect(chunks[1]!.origin).toEqual(chunks[0]!.handoffStop);
    expect(chunks[2]!.origin).toEqual(chunks[1]!.handoffStop);
    expect(chunks[2]!.destination).toEqual(finalDestination);
  });

  it("never puts more than maxIntermediates stops as intermediates in one chunk", () => {
    const s = stops(140);
    const chunks = planWaypointChunks(origin, s, finalDestination, 25);
    for (const c of chunks) {
      expect(c.intermediates.length).toBeLessThanOrEqual(25);
    }
  });
});
