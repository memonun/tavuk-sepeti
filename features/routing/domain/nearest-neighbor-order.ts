/**
 * Greedy nearest-neighbor ordering, starting from a fixed point.
 *
 * Used only to decide CHUNK MEMBERSHIP when a day has more stops than a
 * single Google `computeRoutes` call can optimize (see chunk-waypoints.ts) —
 * it keeps each chunk geographically coherent so the forced handoff point
 * between chunks is never a wild detour. Within a chunk, Google's own
 * `optimizeWaypointOrder` does the real optimization; this pre-sort has no
 * effect on the ≤25-stop path, where the whole set is one chunk anyway.
 *
 * Pure straight-line (haversine) heuristic — no Google Distance Matrix call,
 * no extra quota cost. O(n²), fine at delivery-route scale (low hundreds).
 */
import { haversineMeters, type LatLng } from "@/shared/geo/distance";

export function nearestNeighborOrder<T extends LatLng>(
  origin: LatLng,
  stops: readonly T[],
): T[] {
  const remaining = [...stops];
  const ordered: T[] = [];
  let current: LatLng = origin;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = haversineMeters(current, remaining[0]!);
    for (let i = 1; i < remaining.length; i++) {
      const distance = haversineMeters(current, remaining[i]!);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next!);
    current = next!;
  }

  return ordered;
}
