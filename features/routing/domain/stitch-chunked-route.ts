/**
 * Turn a list of per-chunk Google `computeRoutes` results back into one
 * continuous stop sequence with one running cumulative distance/duration —
 * the part of chunked route-optimization most likely to hide an off-by-one
 * (chunk boundary indices, which leg belongs to a handoff stop, where the
 * running totals pick back up). Kept pure and generic (no RouteStop/DayOrder
 * coupling) so it's directly unit-testable with synthetic data instead of a
 * mocked DB + Google API (get-day-route.ts owns turning each `item` here
 * into a full RouteStop).
 */
export interface ChunkPlanForStitching<T> {
  readonly intermediates: readonly T[];
  /** Non-null only on a non-final chunk: the real stop its forced
   *  destination corresponds to (see chunk-waypoints.ts). */
  readonly handoffStop: T | null;
}

export interface ChunkLegsForStitching {
  /** Indices into this chunk's `intermediates`, in visit order. */
  readonly waypointOrder: readonly number[];
  /** legs[i] is the segment from stop i to stop i+1 (this chunk's origin =
   *  stop 0); one leg longer than `waypointOrder` whenever there's a fixed
   *  destination (a handoff stop, or the route's own final destination). */
  readonly legs: ReadonlyArray<{ readonly distanceM: number; readonly durationS: number }>;
}

export interface StitchedStop<T> {
  readonly item: T;
  readonly legDistanceM: number | null;
  readonly legDurationS: number | null;
  readonly cumulativeDistanceM: number;
  readonly cumulativeDurationS: number;
}

/**
 * `chunkPlans[i]` and `chunkLegs[i]` must correspond to the same chunk (same
 * array length, produced by mapping the same `WaypointChunkPlan[]` through
 * `callGoogleDirections`). `appendItem` is the route's own final destination
 * when it's a pinned order (resolveRouteDestination's `appendStop`) — its leg
 * is the LAST chunk's final leg, same as any other fixed destination.
 */
export function stitchChunkedRoute<T>(
  chunkPlans: ReadonlyArray<ChunkPlanForStitching<T>>,
  chunkLegs: ReadonlyArray<ChunkLegsForStitching>,
  appendItem: T | null,
): StitchedStop<T>[] {
  let cumulativeDistanceM = 0;
  let cumulativeDurationS = 0;
  const stops: StitchedStop<T>[] = [];

  const push = (item: T, distanceM: number | null, durationS: number | null): void => {
    cumulativeDistanceM += distanceM ?? 0;
    cumulativeDurationS += durationS ?? 0;
    stops.push({
      item,
      legDistanceM: distanceM,
      legDurationS: durationS,
      cumulativeDistanceM,
      cumulativeDurationS,
    });
  };

  for (let c = 0; c < chunkPlans.length; c++) {
    const plan = chunkPlans[c]!;
    const legs = chunkLegs[c]!;
    legs.waypointOrder.forEach((srcIdx, i) => {
      const item = plan.intermediates[srcIdx];
      if (!item) {
        throw new Error(`chunk ${c} waypointOrder[${i}]=${srcIdx} out of range`);
      }
      const leg = legs.legs[i];
      push(item, leg?.distanceM ?? null, leg?.durationS ?? null);
    });
    if (plan.handoffStop) {
      const finalLeg = legs.legs[plan.intermediates.length];
      push(plan.handoffStop, finalLeg?.distanceM ?? null, finalLeg?.durationS ?? null);
    }
  }

  if (appendItem) {
    const lastPlan = chunkPlans[chunkPlans.length - 1]!;
    const lastLegs = chunkLegs[chunkLegs.length - 1]!;
    const finalLeg = lastLegs.legs[lastPlan.intermediates.length];
    push(appendItem, finalLeg?.distanceM ?? null, finalLeg?.durationS ?? null);
  }

  return stops;
}
