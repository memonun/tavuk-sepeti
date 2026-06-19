/**
 * Money parse/format helpers for the products UI (TRY ⇄ kuruş). Accept
 * Turkish-style input ("125,50") and emit minor units (integer kuruş). Tier
 * rates allow up to 4 decimals so fractional per-unit prices round to an exact
 * line total in the pricing engine.
 */

/** "125,50" / "125.50" → 12550 kuruş. Returns null on malformed input. */
export function parseTRY2(input: string): number | null {
  const n = input.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(n)) return null;
  return Math.round(Number.parseFloat(n) * 100);
}

/** Like parseTRY2 but keeps up to 4 decimals of kuruş (fractional tier rate). */
export function parseTRY4(input: string): number | null {
  const n = input.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,4})?$/.test(n)) return null;
  return Math.round(Number.parseFloat(n) * 100 * 10000) / 10000;
}

/** Minor units → locale TRY display string (2–4 fraction digits). */
export function formatTRY4(minor: number): string {
  return (minor / 100).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

/** Parse a Turkish-style decimal ("0,5") into a JS number string ("0.5"). */
export function normalizeDecimal(input: string): string {
  return input.replace(/\s/g, "").replace(",", ".");
}
