/**
 * SHA-256 of `${normalized}|${country}` — the cache key.
 *
 * Web Crypto used over node:crypto so the same code path works on Node and
 * Edge runtimes. Two distinct normalized addresses (different street, same
 * city) hash to different keys, so a cache hit means "Google saw this exact
 * input already."
 */
import "server-only";

const COUNTRY = "TR"; // Faz 1 — Faz 2 multi-country adds it as a parameter.

export async function computeInputHash(normalized: string): Promise<string> {
  const encoded = new TextEncoder().encode(`${normalized}|${COUNTRY}`);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
