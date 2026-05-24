/**
 * URL serializer for views — shared between the Server Component
 * landing redirect and the Client Component ViewTabs.
 *
 * Both call sites need to take a View's config (filters + sort) and
 * produce a URLSearchParams that the grid page can re-fetch under. We
 * keep this as a pure helper so the two stay in lockstep.
 *
 * "Tümü" / no-view state is represented as `?view=none` rather than
 * an absent `view` key. That lets the page distinguish:
 *   - landing without a marker → auto-apply default view
 *   - explicit opt-out by clicking "Tümü" → keep showing all rows
 * without resorting to extra cookies / state.
 */
import type { View } from "@/features/views/domain/view";

export const VIEW_NONE = "none";

/**
 * Produce the URLSearchParams string (path-less) for the given view.
 * Pass `null` to mean "Tümü" — the function still sets `view=none`
 * so the page knows the user opted out of the default.
 */
export function buildViewSearchParams(view: View | null): URLSearchParams {
  const next = new URLSearchParams();
  if (view) {
    for (const [key, value] of Object.entries(view.config.filters)) {
      if (value) next.set(key, value);
    }
    if (view.config.sort) {
      next.set("sort", view.config.sort.column);
      next.set("order", view.config.sort.order);
    }
    next.set("view", view.id);
  } else {
    next.set("view", VIEW_NONE);
  }
  return next;
}

/** Convenience — full URL string for a redirect / Link. */
export function buildViewUrl(basePath: string, view: View | null): string {
  const qs = buildViewSearchParams(view).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
