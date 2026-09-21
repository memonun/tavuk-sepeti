/**
 * Offline support for the admin route pages (/routes, /routes/drive).
 *
 * Why: the van drives through rural stretches with no signal, and the route page
 * is server-rendered — with no network the browser has nothing to show, so the
 * driver cannot even see the next stop. This worker keeps the last good copy of
 * the page (and the JS/CSS it needs) so it still opens offline.
 *
 *   - Navigations to /routes*  → NETWORK-FIRST with a short timeout. Online, the
 *     page is always fresh and the copy is refreshed. Offline OR on a stalled
 *     connection (signal bars but no data — the common rural case) the cached
 *     copy is served instead of hanging on a spinner.
 *   - /_next/static/*          → CACHE-FIRST. File names are content hashes, so a
 *     cached file is never stale; it just has to have been fetched once.
 *
 * Scope is limited to /routes/ (registered with that scope) so this can never
 * interfere with the public storefront, checkout or payment flows.
 *
 * Deliberately plain JS, no build step and no dependencies: it is served as-is
 * from /public. Behaviour is covered by features/routing/sw/drive-sw.test.ts.
 */

const VERSION = "v1";
const PAGES_CACHE = `drive-pages-${VERSION}`;
const STATIC_CACHE = `drive-static-${VERSION}`;

/** How long to wait on the network before falling back to the cached page. */
const NETWORK_TIMEOUT_MS = 4000;
/** Cap on stored page copies (one per date/origin/destination combination). */
const MAX_PAGES = 12;
/** Alias key holding the most recently seen drive page — the fallback when the
 *  exact URL was never cached (e.g. the tab reopened on a slightly different
 *  query string). */
const LATEST_DRIVE_KEY = "/__latest-drive";

function isRoutesNavigation(request, url) {
  return (
    request.mode === "navigate" &&
    request.method === "GET" &&
    (url.pathname === "/routes" || url.pathname.startsWith("/routes/"))
  );
}

/** A response that may be stored: a real page, not an error, and not the login
 *  redirect an expired session produces. */
function isCacheablePage(response) {
  if (!response || !response.ok) return false;
  try {
    const path = new URL(response.url).pathname;
    return path === "/routes" || path.startsWith("/routes/");
  } catch {
    return false;
  }
}

/** A navigation must not be answered with a `redirected` response (the browser
 *  throws), and the drive page redirects once to its canonical URL — so strip
 *  the flag by rebuilding the response. */
async function forNavigation(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function trimPages(cache) {
  const keys = await cache.keys();
  const pageKeys = keys.filter((k) => new URL(k.url).pathname !== LATEST_DRIVE_KEY);
  // cache.keys() is insertion-ordered: the oldest entries come first.
  for (const key of pageKeys.slice(0, Math.max(0, pageKeys.length - MAX_PAGES))) {
    await cache.delete(key);
  }
}

/** Takes ownership of `response` (pass a clone if the original is still needed). */
async function storePage(request, response) {
  const cache = await caches.open(PAGES_CACHE);
  const copy = await forNavigation(response);
  // Re-put so the entry moves to the newest position for trimming.
  await cache.delete(request.url);
  await cache.put(request.url, copy.clone());
  if (new URL(request.url).pathname.startsWith("/routes/drive")) {
    await cache.put(new URL(LATEST_DRIVE_KEY, request.url).href, copy.clone());
  }
  await trimPages(cache);
}

async function cachedPage(request) {
  const cache = await caches.open(PAGES_CACHE);
  const exact = await cache.match(request.url);
  if (exact) return exact;
  return cache.match(new URL(LATEST_DRIVE_KEY, request.url).href);
}

async function handleNavigation(event) {
  const request = event.request;
  const network = fetch(request);

  // Refresh the stored copy whenever the network does answer — even after we
  // have already served the cache for a slow connection.
  const refreshed = network.then(async (response) => {
    // Clone SYNCHRONOUSLY, before the page starts reading the original body —
    // cloning after an await would throw "body already used".
    const copy = isCacheablePage(response) ? response.clone() : null;
    if (copy) await storePage(request, copy);
    return response;
  });
  // A failed refresh must never surface as an unhandled rejection.
  refreshed.catch(() => {});
  event.waitUntil(refreshed.catch(() => {}));

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS);
  });

  try {
    const winner = await Promise.race([network, timeout]);
    clearTimeout(timer);
    if (winner) return forNavigation(winner);
    // Timed out: prefer the cached copy, but if there is none keep waiting for
    // the network rather than showing nothing.
    const cached = await cachedPage(request);
    return cached ?? (await network);
  } catch (error) {
    clearTimeout(timer);
    const cached = await cachedPage(request);
    if (cached) return cached;
    throw error;
  }
}

async function handleStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES_CACHE, STATIC_CACHE]);
      for (const name of await caches.keys()) {
        if (name.startsWith("drive-") && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isRoutesNavigation(request, url)) {
    event.respondWith(handleNavigation(event));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(handleStatic(request));
  }
});

/**
 * Messages from the page:
 *   { type: "CACHE_PAGE",   url }    fetch + store this page (used right after
 *                                    the driver opens the route online, so the
 *                                    copy exists even if it was reached through
 *                                    a client-side navigation the worker never
 *                                    saw as a page load).
 *   { type: "CACHE_ASSETS", urls }   fetch + store these /_next/static files
 *                                    (the ones the page already loaded before
 *                                    the worker took control).
 *   { type: "CLEAR" }                drop everything (the page also clears the
 *                                    caches itself on sign-out, see
 *                                    drive-offline-client.ts).
 */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data.type !== "string") return;

  if (data.type === "CLEAR") {
    event.waitUntil(
      (async () => {
        for (const name of await caches.keys()) {
          if (name.startsWith("drive-")) await caches.delete(name);
        }
      })(),
    );
    return;
  }

  if (data.type === "CACHE_PAGE" && typeof data.url === "string") {
    event.waitUntil(
      (async () => {
        const url = new URL(data.url, self.location.origin);
        if (url.origin !== self.location.origin) return;
        if (!(url.pathname === "/routes" || url.pathname.startsWith("/routes/"))) return;
        const request = new Request(url.href, {
          credentials: "same-origin",
          headers: { Accept: "text/html" },
        });
        const response = await fetch(request);
        if (isCacheablePage(response)) await storePage(request, response);
      })().catch(() => {}),
    );
    return;
  }

  if (data.type === "CACHE_ASSETS" && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        for (const raw of data.urls) {
          if (typeof raw !== "string") continue;
          const url = new URL(raw, self.location.origin);
          if (url.origin !== self.location.origin) continue;
          if (!url.pathname.startsWith("/_next/static/")) continue;
          if (await cache.match(url.href)) continue;
          try {
            const response = await fetch(url.href);
            if (response.ok) await cache.put(url.href, response);
          } catch {
            /* offline / flaky — the next visit tries again */
          }
        }
      })(),
    );
  }
});
