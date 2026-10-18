/**
 * Detect when a day's stop set changed UNDER a running drive — an order
 * postponed to another day, cancelled, added, or its pin moved — and decide
 * whether the drive URL's frozen `excludeDelivered` set must be re-frozen.
 *
 * Why: the drive page freezes "already-delivered" ids in the URL when the drive
 * starts (see exclude-delivered-url.ts) so a routine delivery refresh keeps the
 * same waypoint set → Directions cache hit → no reshuffle. But when the set
 * itself changes, the route is re-optimized anyway — and with the OLD frozen
 * set, every stop delivered since the freeze goes back into the waypoints. The
 * optimizer then sequences the whole day again from the morning start point,
 * and the driver sees the route restart at a customer they already visited
 * (2026-10-17: an order was postponed mid-route and the drive "started over").
 *
 * The fingerprint covers exactly what feeds the optimizer's waypoints —
 * order ids + coordinates (same 6-decimal rounding as the Directions cache key)
 * — and deliberately NOT status, so a delivery never changes it.
 *
 * Pure (no IO) so it is unit-testable; the drive/planning pages own the redirect.
 */

/** Minimal order shape the fingerprint needs. DayOrder is structurally assignable. */
export interface RouteSetMember {
  readonly order_id: string;
  readonly lat: number;
  readonly lng: number;
}

/** FNV-1a 32-bit, as 8 hex chars. Not security-relevant — only change detection. */
function fnv1a(input: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Short, order-independent fingerprint of a day's stop set (16 hex chars).
 * Two different seeds give 64 bits, so an accidental collision between two
 * versions of the same day's route is not a practical concern.
 */
export function routeSetFingerprint(orders: readonly RouteSetMember[]): string {
  const canonical = orders
    .map((o) => `${o.order_id}@${o.lat.toFixed(6)},${o.lng.toFixed(6)}`)
    .sort()
    .join("|");
  return fnv1a(canonical, 0x811c9dc5) + fnv1a(canonical, 0x2166136b);
}

/** Validate an untrusted `routeSet` URL param. */
export function parseRouteSetParam(raw: string | undefined | null): string | null {
  return raw && /^[0-9a-f]{16}$/.test(raw) ? raw : null;
}

export type DriveFreezeDecision =
  /** URL is canonical and current — render as-is. */
  | { readonly kind: "keep" }
  /** Rewrite the URL. `refreeze` = the stop set changed, so the route is being
   *  re-optimized: the exclude set is now everything delivered so far and the
   *  caller should re-anchor the start time to "now". */
  | {
      readonly kind: "redirect";
      readonly excludeOrderIds: readonly string[];
      readonly fingerprint: string;
      readonly refreeze: boolean;
    };

export interface DriveFreezeInput {
  /** Raw `excludeDelivered` param; undefined = never frozen (direct entry). */
  readonly excludeParam: string | undefined;
  /** Parsed frozen exclude ids from the URL. */
  readonly frozenExclude: readonly string[];
  /** Parsed `routeSet` param (null = missing or malformed). */
  readonly urlFingerprint: string | null;
  /** Fingerprint of the day's stop set as it is now. */
  readonly currentFingerprint: string;
  /** Orders delivered as of now. */
  readonly deliveredNow: readonly string[];
}

export function decideDriveFreeze(input: DriveFreezeInput): DriveFreezeDecision {
  // First entry without a frozen set: freeze to what is delivered now.
  if (input.excludeParam === undefined) {
    return {
      kind: "redirect",
      excludeOrderIds: input.deliveredNow,
      fingerprint: input.currentFingerprint,
      refreeze: false,
    };
  }
  // A URL from before fingerprints existed (a drive already open at deploy
  // time): adopt the current set without touching the frozen ids, so an
  // in-progress route does not reshuffle just because the app updated.
  if (input.urlFingerprint === null) {
    return {
      kind: "redirect",
      excludeOrderIds: input.frozenExclude,
      fingerprint: input.currentFingerprint,
      refreeze: false,
    };
  }
  if (input.urlFingerprint !== input.currentFingerprint) {
    return {
      kind: "redirect",
      excludeOrderIds: input.deliveredNow,
      fingerprint: input.currentFingerprint,
      refreeze: true,
    };
  }
  return { kind: "keep" };
}
