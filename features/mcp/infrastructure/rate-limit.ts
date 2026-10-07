/**
 * Best-effort per-user rate limit for the connector (CLAUDE.md §10 hook).
 *
 * Fixed window, in memory: on serverless each instance counts on its own, so
 * this bounds a runaway loop / chatty client rather than enforcing a global
 * quota. Swap the body for a shared store (Redis/Upstash) when one exists —
 * callers only depend on `checkRateLimit`.
 */
import "server-only";

const WINDOW_MS = 60_000;
export const MAX_REQUESTS_PER_WINDOW = 120;
const MAX_TRACKED_KEYS = 1_000;

interface Bucket {
  windowStart: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  now: number = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      for (const [k, b] of buckets) {
        if (now - b.windowStart >= WINDOW_MS) buckets.delete(k);
      }
    }
    buckets.set(key, { windowStart: now, count: 1 });
    return { allowed: true };
  }

  bucket.count += 1;
  if (bucket.count > MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000)),
    };
  }
  return { allowed: true };
}

/** Test helper. */
export function resetRateLimitForTests(): void {
  buckets.clear();
}
