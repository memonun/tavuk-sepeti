/**
 * A single short tick for a committing tap (adding to the basket) — a second
 * channel of "that worked" for a shopper who may not have caught the button
 * change. Fired in the same handler as the visual change, so the two land
 * together.
 *
 * Android Chrome only in practice: iOS Safari has no Vibration API, where
 * this is a silent no-op. Skipped when the visitor asked for reduced motion,
 * on the assumption that someone who turned movement down does not want the
 * phone buzzing either.
 */
export function hapticTick(): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  navigator.vibrate(10);
}
