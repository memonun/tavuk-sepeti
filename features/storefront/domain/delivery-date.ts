/**
 * Date-only (YYYY-MM-DD) helpers for delivery scheduling. Pure and
 * timezone-agnostic: the caller resolves "today" to Europe/Istanbul (CLAUDE.md
 * §7) and passes it in. ISO date strings are zero-padded, so lexicographic
 * comparison is also chronological.
 */

/** Add (or subtract) whole days to a YYYY-MM-DD string. UTC math so there's no
 *  DST drift on a date-only value. */
export function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** `true` when `dateIso` is on or after `earliestIso`. */
export function isOnOrAfter(dateIso: string, earliestIso: string): boolean {
  return dateIso >= earliestIso;
}

/** `true` when `dateIso` falls within [earliestIso, latestIso] inclusive. */
export function isWithinWindow(
  dateIso: string,
  earliestIso: string,
  latestIso: string,
): boolean {
  return dateIso >= earliestIso && dateIso <= latestIso;
}
