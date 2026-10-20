/**
 * Bring a field the customer still has to fill into view and put the cursor in
 * it. Centered, so the sticky header never covers it; instant under
 * prefers-reduced-motion. Shared by the checkout's submit button and the
 * address form's save button, which both jump to the first missing field.
 *
 * `fallbackId`: where to go when the field itself is not on the page (the map
 * did not load, say), so the jump lands on the explanation rather than nowhere.
 */
export function revealField(id: string, fallbackId?: string): void {
  const element =
    document.getElementById(id) ?? (fallbackId ? document.getElementById(fallbackId) : null);
  if (!element) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLButtonElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    element.focus({ preventScroll: true });
  }
}
