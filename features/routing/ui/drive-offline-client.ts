"use client";

/**
 * Browser side of the route pages' offline support (the worker itself is
 * public/drive-sw.js). Everything here is best-effort: a browser without
 * service workers, a dev build, or a failed registration must leave the route
 * pages working exactly as before — just without the offline copy.
 */

const SW_URL = "/drive-sw.js";
// No trailing slash on purpose: a scope of "/routes/" would NOT cover the
// planning page at exactly "/routes".
const SW_SCOPE = "/routes";

function supported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

async function activeWorker(): Promise<ServiceWorker | null> {
  if (!supported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.active;
}

/** JS/CSS the page has already loaded — they came in before the worker took
 *  control, so the worker never saw them go by and must be told to store them. */
function loadedStaticAssets(): string[] {
  return performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => {
      try {
        return new URL(name).pathname.startsWith("/_next/static/");
      } catch {
        return false;
      }
    });
}

/**
 * Register the worker (production only — in `next dev` a worker fights HMR) and
 * make sure the CURRENT page and its assets are stored. Safe to call on every
 * route-page mount.
 */
export async function ensureDriveOfflineCopy(): Promise<void> {
  if (!supported() || process.env.NODE_ENV !== "production") return;
  try {
    await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
    const worker = await activeWorker();
    if (!worker || !navigator.onLine) return;
    worker.postMessage({ type: "CACHE_ASSETS", urls: loadedStaticAssets() });
    worker.postMessage({
      type: "CACHE_PAGE",
      url: window.location.pathname + window.location.search,
    });
  } catch {
    /* registration blocked / unsupported — the route pages still work online */
  }
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Re-store the current page after the on-screen state changed on the server
 * (a delivery went through). Without this a reload while offline would show
 * the page as it was when the driver first opened it. Debounced so a burst of
 * deliveries costs one extra page render, not one each.
 */
export function refreshDriveOfflineCopy(delayMs = 2500): void {
  if (!supported() || process.env.NODE_ENV !== "production") return;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    void ensureDriveOfflineCopy();
  }, delayMs);
}

/** Drop the stored copies (sign-out on a shared phone must not leave customer
 *  names and addresses behind). Cache Storage is reachable straight from the
 *  page, so this does not depend on the worker controlling the current page —
 *  the sign-out button lives under /admin, outside the worker's /routes scope. */
export function clearDriveOfflineCache(): void {
  if (typeof caches === "undefined") return;
  void caches
    .keys()
    .then((names) => Promise.all(names.filter((n) => n.startsWith("drive-")).map((n) => caches.delete(n))))
    .catch(() => {});
}
