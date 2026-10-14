/**
 * The Meta Pixel layer's contract: with no Pixel ID it is inert (touches
 * nothing), with one it installs Meta's bootstrap once, never sends personal
 * data, reports a PageView on every storefront page but never sends anything
 * from a URL holding a credential, and never reports the same Purchase twice.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VALID_ID = "123456789012345";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

interface FakeEnv {
  window: Record<string, unknown>;
  /** The page URL Meta would read. Tests move it like a navigation would. */
  location: { href: string };
  scripts: string[];
  localStorage: MemoryStorage;
  sessionStorage: MemoryStorage;
}

/** Browser globals. `touched` records any access, so a no-op test can prove nothing was used. */
function installBrowser(opts: { gpc?: boolean; href?: string } = {}): FakeEnv {
  const scripts: string[] = [];
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const location = { href: opts.href ?? "https://apuhanciftligi.com/" };
  const win: Record<string, unknown> = { localStorage, sessionStorage, location };
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", { globalPrivacyControl: opts.gpc === true });
  vi.stubGlobal("document", {
    createElement: () => ({ async: false, src: "" }),
    head: { appendChild: (el: { src: string }) => scripts.push(el.src) },
  });
  return { window: win, location, scripts, localStorage, sessionStorage };
}

async function load(pixelId: string | undefined) {
  vi.resetModules();
  if (pixelId === undefined) delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
  else process.env.NEXT_PUBLIC_META_PIXEL_ID = pixelId;
  return import("@/shared/analytics/meta-pixel");
}

/** Calls made on the fbq stub before fbevents.js loads (queued), as `[name, ...args]`. */
function queued(env: FakeEnv): unknown[][] {
  const fbq = env.window.fbq as { queue: unknown[][] } | undefined;
  return fbq?.queue ?? [];
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
});

describe("no Pixel ID → completely inert", () => {
  const CASES: Array<[string, string | undefined]> = [
    ["unset", undefined],
    ["empty", ""],
    ["whitespace", "   "],
    ["not numeric", "abc"],
    ["injection attempt", "1234567890'); alert(1);//"],
    ["too short", "123"],
  ];

  for (const [label, value] of CASES) {
    it(`${label}: nothing is installed, loaded or sent`, async () => {
      const env = installBrowser();
      const meta = await load(value);

      meta.trackPageView("/");
      meta.trackAddToCart({ productId: "eggs", productName: "Yumurta", quantity: 1, valueMinor: 12500 });
      meta.trackInitiateCheckout({ contents: [{ id: "eggs", quantity: 1 }], valueMinor: 12500 });
      meta.trackViewContent({ productId: "eggs", productName: "Yumurta", valueMinor: 12500 });
      meta.trackPurchase({ orderId: "AP-1", contents: [{ id: "eggs", quantity: 1 }], valueMinor: 12500 });

      expect(env.window.fbq).toBeUndefined();
      expect(env.scripts).toEqual([]);
      expect(env.localStorage.getItem("ts:meta:purchased:v1")).toBeNull();
      expect(env.sessionStorage.getItem("ts:meta:ic:v1")).toBeNull();
    });
  }

  it("does not even need a browser to exist (server render safe)", async () => {
    const meta = await load(undefined);
    expect(() => meta.trackPageView("/")).not.toThrow();
  });
});

describe("with a Pixel ID", () => {
  let env: FakeEnv;
  beforeEach(() => {
    env = installBrowser();
  });

  it("installs the bootstrap once, config before init, autoConfig off", async () => {
    const meta = await load(VALID_ID);
    meta.trackPageView("/");
    meta.trackPageView("/odeme");

    expect(env.scripts).toEqual(["https://connect.facebook.net/en_US/fbevents.js"]);
    const calls = queued(env);
    expect(calls[0]).toEqual(["set", "autoConfig", false, VALID_ID]);
    expect(calls[1]).toEqual(["init", VALID_ID]);
    expect(calls.filter((c) => c[0] === "init")).toHaveLength(1);
  });

  it("switches off Meta's own pushState PageViews (they would bypass the URL check)", async () => {
    const meta = await load(VALID_ID);
    meta.trackPageView("/");
    expect((env.window.fbq as { disablePushState?: boolean }).disablePushState).toBe(true);
  });

  it("lets Meta accept a PageView per client-side navigation (we dedupe ourselves)", async () => {
    const meta = await load(VALID_ID);
    meta.trackPageView("/");
    expect((env.window.fbq as { allowDuplicatePageViews?: boolean }).allowDuplicatePageViews).toBe(true);
  });

  it("does not install anything until an event is actually reported", async () => {
    await load(VALID_ID);
    expect(env.window.fbq).toBeUndefined();
    expect(env.scripts).toEqual([]);
  });

  it("respects Global Privacy Control", async () => {
    vi.unstubAllGlobals();
    env = installBrowser({ gpc: true });
    const meta = await load(VALID_ID);
    meta.trackPageView("/");
    expect(env.window.fbq).toBeUndefined();
    expect(env.scripts).toEqual([]);
  });

  it("swallows errors thrown by fbq", async () => {
    const meta = await load(VALID_ID);
    meta.trackPageView("/"); // installs the stub
    (env.window.fbq as { callMethod?: () => void }).callMethod = () => {
      throw new Error("meta exploded");
    };
    expect(() => meta.trackPageView("/odeme")).not.toThrow();
    expect(() =>
      meta.trackAddToCart({ productId: "eggs", productName: "Yumurta", quantity: 1, valueMinor: 100 }),
    ).not.toThrow();
  });
});

describe("PageView", () => {
  it("reports each navigation once, not repeated renders of the same path", async () => {
    const env = installBrowser();
    const meta = await load(VALID_ID);
    meta.trackPageView("/");
    meta.trackPageView("/"); // strict-mode double effect / re-render
    meta.trackPageView("/odeme");
    meta.trackPageView("/");

    const views = queued(env).filter((c) => c[0] === "track" && c[1] === "PageView");
    expect(views).toHaveLength(3);
  });

  // Owner decision 2026-10-14: every storefront page, account and checkout
  // pages included.
  it("reports every storefront page", async () => {
    const env = installBrowser();
    const meta = await load(VALID_ID);
    const pages = [
      "/",
      "/odeme",
      "/odeme/basarili",
      "/odeme/basarisiz",
      "/hesap",
      "/giris",
      "/kayit",
      "/siparis-sorgula",
      "/sifremi-unuttum",
      "/sifre-yenile",
      "/e-posta-dogrulandi",
      "/duzenli-siparis",
      "/duzenli-siparis-kosullari",
      "/teslimat-kosullari",
      "/islem-rehberi",
      "/cerez-politikasi",
      "/gizlilik-politikasi",
      "/iptal-iade-kosullari",
      "/kullanim-sartlari",
      "/kvkk",
      "/mesafeli-satis-sozlesmesi",
      "/on-bilgilendirme-formu",
      "/olmayan-bir-sayfa",
    ];
    for (const path of pages) meta.trackPageView(path);

    expect(queued(env).filter((c) => c[1] === "PageView")).toHaveLength(pages.length);
  });

  it("never reports paths that are not storefront pages", async () => {
    const env = installBrowser();
    const meta = await load(VALID_ID);
    for (const path of [
      "/auth/confirm",
      "/auth",
      "/api/paytr/callback",
      "/login",
      "/oauth/consent",
      "/admin",
      "/admin/x",
      "",
      "odeme",
    ]) {
      meta.trackPageView(path);
    }
    expect(env.window.fbq).toBeUndefined();
    expect(env.scripts).toEqual([]);
  });

  // The site-wide 404 mounts the tracker too, so a mistyped admin address must
  // be refused by path. Fails when a new admin section is added without being
  // listed in NEVER_REPORT_PREFIXES.
  it("refuses every admin section, including ones added later", async () => {
    const meta = await load(VALID_ID);
    const adminSegments = readdirSync(join(process.cwd(), "app", "(admin)"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
      .map((entry) => entry.name);

    expect(adminSegments.length).toBeGreaterThan(5);
    for (const segment of adminSegments) {
      expect(meta.isPageViewPath(`/${segment}`), segment).toBe(false);
      expect(meta.isPageViewPath(`/${segment}/yanlis-yazilmis`), segment).toBe(false);
    }
  });

  it("does not mistake a page for a blocked prefix it merely starts with", async () => {
    const meta = await load(VALID_ID);
    expect(meta.isPageViewPath("/apuhan")).toBe(true);
    expect(meta.isPageViewPath("/authors")).toBe(true);
    expect(meta.isPageViewPath("/ordersx")).toBe(true);
    expect(meta.isPageViewPath("/api")).toBe(false);
  });

  it("reports the same page again after a blocked one in between", async () => {
    const env = installBrowser();
    const meta = await load(VALID_ID);
    meta.trackPageView("/");
    meta.trackPageView("/auth/confirm");
    meta.trackPageView("/");
    expect(queued(env).filter((c) => c[1] === "PageView")).toHaveLength(2);
  });
});

describe("credential in the URL", () => {
  const CARD_RETURN = "https://apuhanciftligi.com/odeme/basarili?no=AP-2026-1&t=s3cr3t";
  const pageViews = (env: FakeEnv) => queued(env).filter((c) => c[1] === "PageView");

  it.each([
    ["the card-return token", CARD_RETURN],
    ["an upper-case key", "https://apuhanciftligi.com/odeme/basarili?no=1&T=s3cr3t"],
    ["a Supabase PKCE code", "https://apuhanciftligi.com/giris?code=abc"],
    ["a confirm token hash", "https://apuhanciftligi.com/giris?token_hash=abc&type=email"],
    ["an implicit-flow fragment", "https://apuhanciftligi.com/sifre-yenile#access_token=abc&type=recovery"],
    ["any key=value fragment", "https://apuhanciftligi.com/#error_description=x"],
  ])("sends nothing at all with %s", async (_name, href) => {
    const env = installBrowser({ href });
    const meta = await load(VALID_ID);
    meta.trackPageView(new URL(href).pathname);
    meta.trackAddToCart({ productId: "eggs", productName: "Yumurta", quantity: 1, valueMinor: 100 });
    meta.trackInitiateCheckout({ contents: [{ id: "eggs", quantity: 1 }], valueMinor: 100 });
    meta.trackPurchase({ orderId: "AP-2026-1", contents: [{ id: "eggs", quantity: 1 }], valueMinor: 100 });

    expect(env.window.fbq).toBeUndefined();
    expect(env.scripts).toEqual([]);
  });

  it("sends nothing when the URL cannot be read", async () => {
    const env = installBrowser();
    delete env.window.location;
    const meta = await load(VALID_ID);
    meta.trackPageView("/");
    expect(env.window.fbq).toBeUndefined();
  });

  it.each([
    "https://apuhanciftligi.com/",
    "https://apuhanciftligi.com/?fbclid=IwAR123&utm_source=facebook&utm_campaign=ekim",
    "https://apuhanciftligi.com/?teslimat=kargo&filtre=kuru",
    "https://apuhanciftligi.com/giris?next=%2Fhesap&error=confirm",
    "https://apuhanciftligi.com/odeme/basarisiz?no=AP-2026-1",
    "https://apuhanciftligi.com/#urunler",
  ])("allows %s", async (href) => {
    const meta = await load(VALID_ID);
    expect(meta.isUrlReportable(href)).toBe(true);
  });

  it("holds the card-return PageView back until the token is gone, then sends it once", async () => {
    const env = installBrowser({ href: CARD_RETURN });
    const meta = await load(VALID_ID);
    meta.trackPageView("/odeme/basarili");
    meta.flushDeferredPageView(); // token still there
    expect(env.window.fbq).toBeUndefined();

    env.location.href = "https://apuhanciftligi.com/odeme/basarili?no=AP-2026-1";
    meta.flushDeferredPageView();
    meta.flushDeferredPageView();
    expect(pageViews(env)).toHaveLength(1);
  });

  it("drops the held-back PageView once the customer has moved on", async () => {
    const env = installBrowser({ href: CARD_RETURN });
    const meta = await load(VALID_ID);
    meta.trackPageView("/odeme/basarili");

    env.location.href = "https://apuhanciftligi.com/";
    meta.trackPageView("/");
    meta.flushDeferredPageView();
    expect(pageViews(env)).toHaveLength(1); // "/" only
  });

  it("has nothing to flush on a page that was reported normally", async () => {
    const env = installBrowser();
    const meta = await load(VALID_ID);
    meta.trackPageView("/");
    meta.flushDeferredPageView();
    expect(pageViews(env)).toHaveLength(1);
  });
});

describe("AddToCart / ViewContent", () => {
  it("sends product ids, TRY value and no personal data", async () => {
    const env = installBrowser();
    const meta = await load(VALID_ID);
    meta.trackAddToCart({ productId: "eggs", productName: "Yumurta", quantity: 2, valueMinor: 25050 });

    const call = queued(env).find((c) => c[1] === "AddToCart");
    expect(call?.[2]).toEqual({
      content_ids: ["eggs"],
      content_name: "Yumurta",
      content_type: "product",
      contents: [{ id: "eggs", quantity: 2 }],
      value: 250.5,
      currency: "TRY",
    });
  });

  it("ViewContent carries the documented fields", async () => {
    const env = installBrowser();
    const meta = await load(VALID_ID);
    meta.trackViewContent({ productId: "cheese", productName: "Peynir", valueMinor: 10000, eventId: "vc:1" });

    const call = queued(env).find((c) => c[1] === "ViewContent");
    expect(call?.[2]).toEqual({
      content_ids: ["cheese"],
      content_name: "Peynir",
      content_type: "product",
      value: 100,
      currency: "TRY",
    });
    expect(call?.[3]).toEqual({ eventID: "vc:1" });
  });
});

describe("InitiateCheckout", () => {
  const basket = [
    { id: "eggs", quantity: 2 },
    { id: "cheese", quantity: 0.5 },
  ];

  it("reports the basket once per tab session, again when it changes", async () => {
    const env = installBrowser();
    const meta = await load(VALID_ID);
    meta.trackInitiateCheckout({ contents: basket, valueMinor: 30000 });
    meta.trackInitiateCheckout({ contents: [...basket].reverse(), valueMinor: 30000 }); // reload / re-render
    meta.trackInitiateCheckout({ contents: [{ id: "eggs", quantity: 3 }], valueMinor: 37500 });

    const calls = queued(env).filter((c) => c[1] === "InitiateCheckout");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[2]).toMatchObject({
      content_ids: ["eggs", "cheese"],
      num_items: 2,
      value: 300,
      currency: "TRY",
    });
  });

  it("ignores an empty basket", async () => {
    const env = installBrowser();
    const meta = await load(VALID_ID);
    meta.trackInitiateCheckout({ contents: [], valueMinor: 0 });
    expect(env.window.fbq).toBeUndefined();
  });

  it("checkoutSignature ignores line order", async () => {
    installBrowser();
    const meta = await load(VALID_ID);
    expect(meta.checkoutSignature(basket)).toBe(meta.checkoutSignature([...basket].reverse()));
  });
});

describe("Purchase", () => {
  const purchase = { orderId: "AP-2026-1", contents: [{ id: "eggs", quantity: 2 }], valueMinor: 25000 };
  const purchases = (env: FakeEnv) => queued(env).filter((c) => c[1] === "Purchase");

  it("sends once with eventID purchase:<orderId> for CAPI deduplication", async () => {
    const env = installBrowser();
    const meta = await load(VALID_ID);
    meta.trackPurchase(purchase);

    expect(purchases(env)).toHaveLength(1);
    expect(purchases(env)[0]?.[2]).toMatchObject({ value: 250, currency: "TRY", content_ids: ["eggs"] });
    expect(purchases(env)[0]?.[3]).toEqual({ eventID: "purchase:AP-2026-1" });
  });

  it("does not repeat on re-render", async () => {
    const env = installBrowser();
    const meta = await load(VALID_ID);
    meta.trackPurchase(purchase);
    meta.trackPurchase(purchase);
    expect(purchases(env)).toHaveLength(1);
  });

  it("does not repeat after a refresh / re-opened page (persisted across page loads)", async () => {
    const env = installBrowser();
    let meta = await load(VALID_ID);
    meta.trackPurchase(purchase);

    // A new page load: fresh module state, same localStorage, no fbq yet.
    delete env.window.fbq;
    meta = await load(VALID_ID);
    meta.trackPurchase(purchase);
    expect(purchases(env)).toHaveLength(0);
  });

  it("reports a different order", async () => {
    const env = installBrowser();
    const meta = await load(VALID_ID);
    meta.trackPurchase(purchase);
    meta.trackPurchase({ ...purchase, orderId: "AP-2026-2" });
    expect(purchases(env)).toHaveLength(2);
  });

  it("still blocks re-render duplicates when storage is unavailable", async () => {
    const env = installBrowser();
    env.window.localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const meta = await load(VALID_ID);
    expect(() => meta.trackPurchase(purchase)).not.toThrow();
    meta.trackPurchase(purchase);
    expect(purchases(env)).toHaveLength(1);
  });

  it("ignores a call without an order id", async () => {
    const env = installBrowser();
    const meta = await load(VALID_ID);
    meta.trackPurchase({ ...purchase, orderId: "" });
    expect(env.window.fbq).toBeUndefined();
  });
});

describe("helpers", () => {
  it("converts kuruş to TRY without float noise", async () => {
    installBrowser();
    const meta = await load(VALID_ID);
    expect(meta.minorToMajor(12345)).toBe(123.45);
    expect(meta.minorToMajor(0)).toBe(0);
  });

  it("builds the shared event id", async () => {
    installBrowser();
    const meta = await load(VALID_ID);
    expect(meta.metaEventId("purchase", "AP-1")).toBe("purchase:AP-1");
  });
});
