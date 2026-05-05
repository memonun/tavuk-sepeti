/**
 * Address normalization for cache key + outbound query.
 *
 * Turkish-aware: `İ.toLocaleLowerCase("tr-TR")` correctly produces `i`
 * (default lower-case in JS would yield `i̇` with a combining dot above).
 * Multi-space runs collapse to one — pasted addresses commonly have those.
 *
 * Pure function: no fetch, no crypto. The hash (sha256 of `${normalized}|${country}`)
 * is computed in the infrastructure layer where Web Crypto / node:crypto live.
 */
export function normalizeAddress(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr-TR");
}
