/**
 * Transport for the route's frozen "already-delivered, keep out of the
 * optimizer" set, carried as the `excludeDelivered` URL param.
 *
 * Freezing the set in the URL (rather than reading order status live) is what
 * keeps the optimized waypoint set — and the Directions cache key — stable
 * across the passive refresh after each delivery, so a routine delivery costs
 * no Google call and never reshuffles the route. Only an explicit re-optimize
 * rewrites the param. See partition-delivered-orders.ts and get-day-route.ts.
 *
 * Pure (no IO) and parses untrusted URL input defensively (CLAUDE.md §4):
 * trims, drops blanks, dedupes, and caps count/length so a hostile URL can't
 * bloat the request.
 */
const MAX_IDS = 500;
const MAX_ID_LEN = 64;

/** Parse the `excludeDelivered` param into a clean, deduped id list. */
export function parseExcludeDelivered(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const token of raw.split(",")) {
    const id = token.trim();
    if (id.length > 0 && id.length <= MAX_ID_LEN) seen.add(id);
    if (seen.size >= MAX_IDS) break;
  }
  return [...seen];
}

/** Serialize an id set into the `excludeDelivered` param value (deduped). */
export function serializeExcludeDelivered(ids: Iterable<string>): string {
  return [...new Set(ids)].join(",");
}
