/**
 * Money helpers. All values internal to the app travel as `minor` units
 * (kuruş) — `bigint`/`number` integers, never floats. CLAUDE.md §7.
 *
 * Conversion to display happens at the very edge (UI / receipt PDFs).
 */

/**
 * Deliberately NOT `style: "currency"`. ICU's tr-TR currency format puts the
 * symbol in FRONT — `₺42,50`, `₺1.000,00` — which is not how prices are written
 * in Turkish commerce, and the mismatch showed up in customer-facing sentences
 * like "alt limit ₺1.000,00. Sepetinize ₺340,00 daha eklemeniz gerekiyor."
 * Grouping and the decimal comma still come from the locale; only the symbol's
 * position is ours.
 */
const TRY_AMOUNT_FORMATTER = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `4250` (kuruş) → `42,50 ₺` */
export function formatTRY(minor: number | bigint): string {
  const major = Number(minor) / 100;
  // U+00A0 so the amount never wraps away from its symbol.
  return `${TRY_AMOUNT_FORMATTER.format(major)}\u00a0₺`;
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
