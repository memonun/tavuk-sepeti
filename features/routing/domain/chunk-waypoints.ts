/**
 * Split a (nearest-neighbor-ordered) stop list into Google `computeRoutes`
 * requests, each within the API's real 25-intermediate cap.
 *
 * `computeRoutes` requires exactly one `destination` per call, so a non-final
 * chunk "spends" one of its own stops as a forced destination — the point
 * the previous chunk's leg sequence actually ends at, and the next chunk's
 * origin. `optimizeWaypointOrder` still freely reorders the OTHER stops in
 * that chunk; only the handoff point itself is fixed. The final chunk uses
 * the route's real final destination (the origin on a round trip, a saved
 * location, or a pinned order) instead of a handoff stop.
 *
 * When `orderedStops.length <= maxIntermediates` this returns exactly one
 * chunk shaped identically to a plain (pre-chunking) computeRoutes call, so
 * the common case is untouched.
 */
import type { LatLng } from "@/shared/geo/distance";

export interface WaypointChunkPlan<T extends LatLng> {
  readonly origin: LatLng;
  readonly intermediates: readonly T[];
  readonly destination: LatLng;
  /** The real stop `destination` corresponds to, when it's a forced handoff
   *  to the next chunk rather than the route's own final destination. */
  readonly handoffStop: T | null;
}

export function planWaypointChunks<T extends LatLng>(
  origin: LatLng,
  orderedStops: readonly T[],
  finalDestination: LatLng,
  maxIntermediates: number,
): WaypointChunkPlan<T>[] {
  const chunks: WaypointChunkPlan<T>[] = [];
  let cursor = 0;
  let chunkOrigin = origin;

  for (;;) {
    const remaining = orderedStops.length - cursor;
    if (remaining <= maxIntermediates) {
      chunks.push({
        origin: chunkOrigin,
        intermediates: orderedStops.slice(cursor),
        destination: finalDestination,
        handoffStop: null,
      });
      return chunks;
    }

    const intermediates = orderedStops.slice(cursor, cursor + maxIntermediates);
    const handoffStop = orderedStops[cursor + maxIntermediates]!;
    chunks.push({
      origin: chunkOrigin,
      intermediates,
      destination: handoffStop,
      handoffStop,
    });
    cursor += maxIntermediates + 1;
    chunkOrigin = handoffStop;
  }
}
