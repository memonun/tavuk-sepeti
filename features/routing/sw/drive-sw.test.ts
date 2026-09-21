/**
 * Behaviour of public/drive-sw.js — the worker that keeps the route pages
 * usable with no signal. It is plain JS served as-is, so the test evaluates the
 * real file in a sandbox with fake Cache Storage / fetch / clients and drives
 * its event handlers directly.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGIN = "https://apuhanciftligi.com";
const SOURCE = readFileSync(path.resolve(__dirname, "../../../public/drive-sw.js"), "utf8");

type Handler = (event: unknown) => void;

class FakeCache {
  readonly store = new Map<string, Response>();
  private keyOf(req: string | { url: string }): string {
    return typeof req === "string" ? req : req.url;
  }
  async match(req: string | { url: string }) {
    return this.store.get(this.keyOf(req))?.clone();
  }
  async put(req: string | { url: string }, res: Response) {
    this.store.set(this.keyOf(req), res);
  }
  async delete(req: string | { url: string }) {
    return this.store.delete(this.keyOf(req));
  }
  async keys() {
    return [...this.store.keys()].map((url) => ({ url }));
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
    skipWaiting: vi.fn(),
    addEventListener(type: string, fn: Handler) {
      handlers[type] = fn;
    },
  };
  vm.runInNewContext(SOURCE, {
    self,
    caches,
    fetch: (req: unknown) => fetchMock(req),
    Response,
    Request,
    URL,
    setTimeout: (...a: Parameters<typeof setTimeout>) => setTimeout(...a),
    clearTimeout: (...a: Parameters<typeof clearTimeout>) => clearTimeout(...a),
  });
  return { handlers, cacheMap, fetchMock, self };
}

/** A FetchEvent stand-in. Node's Request refuses mode "navigate", so a plain object is used. */
function fetchEvent(url: string, init: { mode?: string; method?: string } = {}) {
  const waits: Promise<unknown>[] = [];
  const event = {
    request: { url, method: init.method ?? "GET", mode: init.mode ?? "navigate" },
    responded: undefined as Promise<Response> | undefined,
    respondWith(p: Promise<Response>) {
      this.responded = p;
    },
    waitUntil(p: Promise<unknown>) {
      waits.push(p);
    },
  };
  return { event, settle: () => Promise.all(waits) };
}

/** A Response that claims a URL/redirect state (those are read-only on real ones). */
function page(body: string, opts: { url: string; redirected?: boolean; status?: number }) {
  const res = new Response(body, { status: opts.status ?? 200 });
  Object.defineProperty(res, "url", { value: opts.url });
  Object.defineProperty(res, "redirected", { value: opts.redirected ?? false });
  return res;
}

const DRIVE = `${ORIGIN}/routes/drive?date=2026-09-22&start=09:00`;

let worker: ReturnType<typeof createWorker>;
beforeEach(() => {
  vi.useFakeTimers();
  worker = createWorker();
});
afterEach(() => {
  vi.useRealTimers();
});

async function navigate(url: string) {
  const { event, settle } = fetchEvent(url);
  worker.handlers.fetch!(event);
  const promise = event.responded!;
  return { promise, settle };
}

describe("navigation to /routes*", () => {
  it("serves the network page and stores a copy for later", async () => {
    worker.fetchMock.mockResolvedValue(page("<p>fresh</p>", { url: DRIVE }));

    const { promise, settle } = await navigate(DRIVE);
    expect(await (await promise).text()).toBe("<p>fresh</p>");
    await settle();

    // Signal gone: the stored copy answers.
    worker.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const offline = await navigate(DRIVE);
    expect(await (await offline.promise).text()).toBe("<p>fresh</p>");
  });

  it("falls back to the stored copy when the connection stalls", async () => {
    worker.fetchMock.mockResolvedValue(page("<p>old</p>", { url: DRIVE }));
    await (await navigate(DRIVE)).settle();

    // Bars but no data: the request never answers.
    worker.fetchMock.mockReturnValue(new Promise(() => {}));
    const { promise } = await navigate(DRIVE);
    await vi.advanceTimersByTimeAsync(4000);
    expect(await (await promise).text()).toBe("<p>old</p>");
  });

  it("keeps waiting for the network when there is nothing stored", async () => {
    let answer!: (r: Response) => void;
    worker.fetchMock.mockReturnValue(new Promise<Response>((r) => (answer = r)));
    const { promise } = await navigate(DRIVE);
    await vi.advanceTimersByTimeAsync(4000);
    answer(page("<p>late</p>", { url: DRIVE }));
    expect(await (await promise).text()).toBe("<p>late</p>");
  });

  it("answers an unseen URL with the most recent drive page", async () => {
    worker.fetchMock.mockResolvedValue(page("<p>route</p>", { url: DRIVE }));
    await (await navigate(DRIVE)).settle();

    worker.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const other = await navigate(`${ORIGIN}/routes/drive?date=2026-09-22&start=09:30&x=1`);
    expect(await (await other.promise).text()).toBe("<p>route</p>");
  });

  it("re-throws when offline with nothing stored", async () => {
    worker.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { promise } = await navigate(DRIVE);
    await expect(promise).rejects.toThrow("Failed to fetch");
  });

  it("never stores the login redirect an expired session produces", async () => {
    worker.fetchMock.mockResolvedValue(
      page("<p>login</p>", { url: `${ORIGIN}/login`, redirected: true }),
    );
    await (await navigate(DRIVE)).settle();

    worker.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { promise } = await navigate(DRIVE);
    await expect(promise).rejects.toThrow();
  });

  it("does not store an error page", async () => {
    worker.fetchMock.mockResolvedValue(page("boom", { url: DRIVE, status: 500 }));
    await (await navigate(DRIVE)).settle();

    worker.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect((await navigate(DRIVE)).promise).rejects.toThrow();
  });

  it("serves a stored page that came through a redirect without the redirected flag", async () => {
    // /routes/drive redirects once to its canonical URL; a navigation cannot be
    // answered with a `redirected` response.
    worker.fetchMock.mockResolvedValue(
      page("<p>canonical</p>", { url: `${DRIVE}&excludeDelivered=`, redirected: true }),
    );
    const first = await navigate(DRIVE);
    expect((await first.promise).redirected).toBe(false);
    await first.settle();

    worker.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const offline = await (await navigate(DRIVE)).promise;
    expect(offline.redirected).toBe(false);
    expect(await offline.text()).toBe("<p>canonical</p>");
  });

  it("keeps at most 12 stored pages, dropping the oldest", async () => {
    for (let i = 0; i < 14; i++) {
      const url = `${ORIGIN}/routes?date=2026-09-${String(i + 1).padStart(2, "0")}`;
      worker.fetchMock.mockResolvedValue(page(`p${i}`, { url }));
      await (await navigate(url)).settle();
    }
    const cache = worker.cacheMap.get("drive-pages-v1")!;
    expect(cache.store.size).toBe(12);
    expect(cache.store.has(`${ORIGIN}/routes?date=2026-09-01`)).toBe(false);
    expect(cache.store.has(`${ORIGIN}/routes?date=2026-09-14`)).toBe(true);
  });
});

describe("what the worker leaves alone", () => {
  it("ignores non-GET, non-navigation, other-origin and non-/routes requests", () => {
    const cases = [
      fetchEvent(DRIVE, { method: "POST" }),
      fetchEvent(`${ORIGIN}/`, { mode: "navigate" }),
      fetchEvent(`${ORIGIN}/odeme`, { mode: "navigate" }),
      fetchEvent(`${ORIGIN}/routes/drive?_rsc=1`, { mode: "cors" }),
      fetchEvent("https://maps.googleapis.com/maps/api/js", { mode: "no-cors" }),
    ];
    for (const { event } of cases) {
      worker.handlers.fetch!(event);
      expect(event.responded).toBeUndefined();
    }
  });
});

describe("static assets", () => {
  const ASSET = `${ORIGIN}/_next/static/chunks/abc123.js`;

  it("fetches once, then serves from the cache", async () => {
    worker.fetchMock.mockResolvedValue(new Response("js"));
    const first = fetchEvent(ASSET, { mode: "no-cors" });
    worker.handlers.fetch!(first.event);
    expect(await (await first.event.responded!).text()).toBe("js");

    worker.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const second = fetchEvent(ASSET, { mode: "no-cors" });
    worker.handlers.fetch!(second.event);
    expect(await (await second.event.responded!).text()).toBe("js");
    expect(worker.fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("messages from the page", () => {
  const message = (data: unknown) => {
    const waits: Promise<unknown>[] = [];
    worker.handlers.message!({ data, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    return Promise.all(waits);
  };

  it("CACHE_PAGE fetches and stores a /routes page", async () => {
    worker.fetchMock.mockResolvedValue(page("<p>stored</p>", { url: DRIVE }));
    await message({ type: "CACHE_PAGE", url: "/routes/drive?date=2026-09-22&start=09:00" });

    worker.fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { promise } = await navigate(DRIVE);
    expect(await (await promise).text()).toBe("<p>stored</p>");
  });

  it("CACHE_PAGE refuses anything outside /routes", async () => {
    await message({ type: "CACHE_PAGE", url: "/odeme" });
    await message({ type: "CACHE_PAGE", url: "https://evil.example/routes/x" });
    expect(worker.fetchMock).not.toHaveBeenCalled();
  });

  it("CACHE_ASSETS stores only same-origin /_next/static files, once", async () => {
    worker.fetchMock.mockImplementation(async () => new Response("asset"));
    await message({
      type: "CACHE_ASSETS",
      urls: [
        `${ORIGIN}/_next/static/chunks/a.js`,
        `${ORIGIN}/_next/static/chunks/a.js`,
        `${ORIGIN}/api/secret`,
        "https://evil.example/_next/static/x.js",
      ],
    });
    expect(worker.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("CLEAR drops every stored copy", async () => {
    worker.fetchMock.mockResolvedValue(page("<p>x</p>", { url: DRIVE }));
    await (await navigate(DRIVE)).settle();
    expect(worker.cacheMap.size).toBeGreaterThan(0);

    await message({ type: "CLEAR" });
    expect(worker.cacheMap.size).toBe(0);
  });
});

describe("activate", () => {
  it("removes caches from older versions and takes control", async () => {
    await worker.self.clients.claim.mockClear();
    worker.cacheMap.set("drive-pages-v0", new FakeCache());
    worker.cacheMap.set("unrelated", new FakeCache());
    const waits: Promise<unknown>[] = [];
    worker.handlers.activate!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);

    expect(worker.cacheMap.has("drive-pages-v0")).toBe(false);
    expect(worker.cacheMap.has("unrelated")).toBe(true);
    expect(worker.self.clients.claim).toHaveBeenCalled();
  });
});
