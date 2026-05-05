/**
 * Money helpers. All values internal to the app travel as `minor` units
 * (kuruş) — `bigint`/`number` integers, never floats. CLAUDE.md §7.
 *
 * Conversion to display happens at the very edge (UI / receipt PDFs).
 */

const TRY_FORMATTER = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `4250` (kuruş) → `42,50 ₺` */
export function formatTRY(minor: number | bigint): string {
  const major = Number(minor) / 100;
  return TRY_FORMATTER.format(major);
}

/** Parse a user-typed string like `"42,50"` or `"42.50"` into kuruş.
 *  Returns `null` on unparseable input — callers (Zod) decide what to do. */
export function parseTRYInput(input: string): number | null {
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const major = Number.parseFloat(normalized);
  return Math.round(major * 100);
}

/** Sum kuruş amounts with no float drift. */
export function sumMinor(values: ReadonlyArray<number>): number {
  return values.reduce((acc, n) => acc + n, 0);
}
