/**
 * Behaviour of public/admin-sw.js — the worker that shows a built-in
 * "İnternet yok" page when an admin page can't load. It is plain JS served
 * as-is, so the test evaluates the real file in a sandbox with fake Cache
 * Storage / fetch and drives its event handlers directly (same harness as
 * features/routing/sw/drive-sw.test.ts).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ADMIN_ROUTE_PREFIXES } from "@/shared/routes/admin-route-prefixes";

const ORIGIN = "https://apuhanciftligi.com";
const SOURCE = readFileSync(path.resolve(__dirname, "../public/admin-sw.js"), "utf8");
const OFFLINE_BODY = "<p>offline</p>";

type Handler = (event: unknown) => void;

class FakeCache {
  readonly store = new Map<string, Response>();
  private keyOf(req: string | { url: string }): string {
    const raw = typeof req === "string" ? req : req.url;
    return new URL(raw, ORIGIN).href;
  }
  async match(req: string | { url: string }) {
    return this.store.get(this.keyOf(req))?.clone();
  }
  async add(req: string | { url: string }) {
    this.store.set(this.keyOf(req), new Response(OFFLINE_BODY));
  }
}

function createWorker() {
  const handlers: Record<string, Handler> = {};
  const cacheMap = new Map<string, FakeCache>();
  const fetchMock = vi.fn<(req: unknown) => Promise<Response>>();
  const caches = {
    async open(name: string) {
      if (!cacheMap.has(name)) cacheMap.set(name, new FakeCache());
      return cacheMap.get(name)!;
    },
    async keys() {
      return [...cacheMap.keys()];
    },
    async delete(name: string) {
      return cacheMap.delete(name);
    },
  };
  const self = {
    location: { origin: ORIGIN },
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(async () => {}),
    addEventListener(type: string, fn: Handler) {
      handlers[type] = fn;
    },
  };
  // The worker builds `new Request("/offline.html")`; Node's Request needs an
  // absolute URL, so resolve relative ones against the site like a browser.
  class SiteRequest extends Request {
    constructor(input: string, init?: RequestInit) {
      super(new URL(input, ORIGIN).href, init);
    }
  }
  vm.runInNewContext(SOURCE, {
    self,
    caches,
    fetch: (req: unknown) => fetchMock(req),
    Response,
    Request: SiteRequest,
    URL,
    setTimeout: (...a: Parameters<typeof setTimeout>) => setTimeout(...a),
    clearTimeout: (...a: Parameters<typeof clearTimeout>) => clearTimeout(...a),
  });
  return { handlers, cacheMap, fetchMock, self };
}

/** Run the install step (stores /offline.html). */
async function install(worker: ReturnType<typeof createWorker>) {
  const waits: Promise<unknown>[] = [];
  worker.handlers.install!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
  await Promise.all(waits);
}

/** A FetchEvent stand-in. Node's Request refuses mode "navigate", so a plain object is used. */
function fetchEvent(url: string, init: { mode?: string; method?: string } = {}) {
  return {
    request: { url, method: init.method ?? "GET", mode: init.mode ?? "navigate" },
    responded: undefined as Promise<Response> | undefined,
    respondWith(p: Promise<Response>) {
      this.responded = p;
    },
  };
}

let worker: ReturnType<typeof createWorker>;
beforeEach(async () => {
  vi.useFakeTimers();
  worker = createWorker();
  await install(worker);
});
afterEach(() => {
  vi.useRealTimers();
});

function navigate(url: string, init?: { mode?: string; method?: string }) {
  const event = fetchEvent(url, init);
  worker.handlers.fetch!(event);
  return event.responded;
}

describe("which requests the worker answers", () => {
  it("answers page loads of every admin section and /login", () => {
    worker.fetchMock.mockReturnValue(new Promise(() => {}));
    for (const prefix of ADMIN_ROUTE_PREFIXES) {
      expect(navigate(`${ORIGIN}${prefix}`), prefix).toBeDefined();
      expect(navigate(`${ORIGIN}${prefix}/x?y=1`), `${prefix}/x`).toBeDefined();
    }
    expect(navigate(`${ORIGIN}/login?next=/orders`)).toBeDefined();
  });

  it("leaves the storefront, checkout and payment alone", () => {
    for (const p of ["/", "/urun/yumurta", "/odeme", "/giris", "/hesap", "/api/paytr/callback", "/ordersx", "/administrator"]) {
      expect(navigate(`${ORIGIN}${p}`), p).toBeUndefined();
    }
  });

  it("leaves non-page requests alone, even on admin paths", () => {
    expect(navigate(`${ORIGIN}/orders`, { mode: "cors" })).toBeUndefined();
    expect(navigate(`${ORIGIN}/orders`, { mode: "navigate", method: "POST" })).toBeUndefined();
    expect(navigate(`${ORIGIN}/_next/static/chunk.js`, { mode: "no-cors" })).toBeUndefined();
  });

  it("leaves other origins alone", () => {
    expect(navigate("https://example.com/admin")).toBeUndefined();
  });
});

describe("admin page loads", () => {
  it("passes the network answer straight through", async () => {
    const live = new Response("<p>orders</p>");
    worker.fetchMock.mockResolvedValue(live);
    const res = await navigate(`${ORIGIN}/orders`)!;
    expect(await res.text()).toBe("<p>orders</p>");
  });

  it("passes server errors through (they are not 'offline')", async () => {
    worker.fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    const res = await navigate(`${ORIGIN}/admin`)!;
    expect(res.status).toBe(500);
  });

  it("shows the offline page when there is no connection", async () => {
    worker.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const res = await navigate(`${ORIGIN}/admin`)!;
    expect(await res.text()).toBe(OFFLINE_BODY);
  });

  it("shows the offline page when the connection stalls", async () => {
    worker.fetchMock.mockReturnValue(new Promise(() => {}));
    const pending = navigate(`${ORIGIN}/kargo`)!;
    await vi.advanceTimersByTimeAsync(12000);
    expect(await (await pending).text()).toBe(OFFLINE_BODY);
  });

  it("still gives a slow-but-working connection the real page", async () => {
    let answer!: (r: Response) => void;
    worker.fetchMock.mockReturnValue(new Promise<Response>((r) => (answer = r)));
    const pending = navigate(`${ORIGIN}/orders`)!;
    await vi.advanceTimersByTimeAsync(8000);
    answer(new Response("<p>slow</p>"));
    expect(await (await pending).text()).toBe("<p>slow</p>");
  });

  it("re-throws when offline and the offline page was never stored", async () => {
    worker.cacheMap.clear();
    worker.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(navigate(`${ORIGIN}/admin`)!).rejects.toThrow("Failed to fetch");
  });
});

describe("lifecycle", () => {
  it("drops caches from older versions on activate, keeping the current one and drive-sw's", async () => {
    worker.cacheMap.set("admin-offline-v0", new FakeCache());
    worker.cacheMap.set("drive-pages-v1", new FakeCache());
    const waits: Promise<unknown>[] = [];
    worker.handlers.activate!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    expect([...worker.cacheMap.keys()].sort()).toEqual(["admin-offline-v1", "drive-pages-v1"]);
  });
});

describe("ADMIN_PREFIXES", () => {
  // The worker is plain JS and can't import the shared list, so it keeps a
  // copy; this fails when the two drift apart.
  it("matches shared/routes/admin-route-prefixes.ts exactly", () => {
    const literal = /const ADMIN_PREFIXES = \[([^\]]*)\]/.exec(SOURCE)?.[1] ?? "";
    const inWorker = [...literal.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
    expect(inWorker).toEqual([...ADMIN_ROUTE_PREFIXES].sort());
  });
});
