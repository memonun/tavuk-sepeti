/**
 * Meta Pixel on/off switch — the ONE place that decides whether any Meta
 * tracking exists.
 *
 *   NEXT_PUBLIC_META_PIXEL_ID unset / blank / malformed → OFF: no script, no
 *   `fbq`, no network request, no event, nothing rendered.
 *   NEXT_PUBLIC_META_PIXEL_ID = a numeric Pixel ID       → ON.
 *
 * Deliberately NOT part of shared/env.ts's boot validation: that validation
 * throws on a bad value and would take the whole shop down at startup. A typo in
 * an analytics ID must never do that — a malformed value simply means OFF.
 *
 * The variable is referenced as the literal `process.env.NEXT_PUBLIC_META_PIXEL_ID`
 * (Next only inlines literal references), so it is fixed at BUILD time: adding the
 * ID later needs a redeploy/rebuild, which is the intended activation path.
 *
 * Safe on server and client (no window access here).
 */

/** Meta Pixel IDs are plain digits (15–16 today). Anything else is treated as
 *  "no Pixel". The digits-only rule also makes the value safe to embed anywhere. */
const PIXEL_ID_PATTERN = /^\d{8,20}$/;

/** The configured Pixel ID, or `null` when Meta tracking is off. */
export function getMetaPixelId(): string | null {
  const raw = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  return raw && PIXEL_ID_PATTERN.test(raw) ? raw : null;
}

export function isMetaPixelEnabled(): boolean {
  return getMetaPixelId() !== null;
}
