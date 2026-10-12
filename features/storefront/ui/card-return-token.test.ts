/**
 * The card-return token must be out of the address bar before anything is
 * reported to a third party, and must still be recoverable afterwards — and the
 * function has to say "no" rather than strip a token it could not keep.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  recallReturnToken,
  retireReturnTokenFromUrl,
} from "@/features/storefront/ui/card-return-token";

class MemoryStorage {
  private data = new Map<string, string>();
  constructor(private readonly opts: { failWrites?: boolean; dropWrites?: boolean } = {}) {}
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.opts.failWrites) throw new Error("QuotaExceededError");
    if (this.opts.dropWrites) return;
    this.data.set(k, v);
  }
}

interface FakeBrowser {
  location: { href: string };
  replaced: Array<{ state: unknown; url: string }>;
  localStorage: MemoryStorage;
}

function installBrowser(
  href: string,
  opts: { storage?: MemoryStorage; replaceThrows?: boolean; replaceIgnored?: boolean } = {},
): FakeBrowser {
  const location = { href };
  const replaced: FakeBrowser["replaced"] = [];
  const localStorage = opts.storage ?? new MemoryStorage();
  vi.stubGlobal("window", {
    location,
    localStorage,
    history: {
      state: { __NA: true },
      replaceState: (state: unknown, _unused: string, url: string) => {
        if (opts.replaceThrows) throw new Error("SecurityError");
        replaced.push({ state, url });
        if (!opts.replaceIgnored) location.href = new URL(url, location.href).href;
      },
    },
  });
  return { location, replaced, localStorage };
}

const RETURN_URL = "https://apuhanciftligi.com/odeme/basarili?no=ORD-2026-00123&t=s3cr3t-token";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("retireReturnTokenFromUrl", () => {
  it("removes `t` from the URL, keeps `no`, and remembers the token", () => {
    const browser = installBrowser(RETURN_URL);

    expect(retireReturnTokenFromUrl("ORD-2026-00123")).toBe(true);

    expect(browser.location.href).toBe(
      "https://apuhanciftligi.com/odeme/basarili?no=ORD-2026-00123",
    );
    expect(recallReturnToken("ORD-2026-00123")).toBe("s3cr3t-token");
  });

  // Next's router skips its own sync for a state object carrying its marker and
  // would later write the old URL — token included — straight back.
  it("hands replaceState a null state, never the router's own", () => {
    const browser = installBrowser(RETURN_URL);

    retireReturnTokenFromUrl("ORD-2026-00123");

    expect(browser.replaced).toEqual([
      { state: null, url: "/odeme/basarili?no=ORD-2026-00123" },
    ]);
  });

  it("is a clean yes when the URL holds no token", () => {
    const browser = installBrowser("https://apuhanciftligi.com/odeme/basarili?no=ORD-2026-00123");

    expect(retireReturnTokenFromUrl("ORD-2026-00123")).toBe(true);
    expect(browser.replaced).toEqual([]);
  });

  it.each([
    ["storage throws", new MemoryStorage({ failWrites: true })],
    ["storage silently keeps nothing", new MemoryStorage({ dropWrites: true })],
  ])("refuses and leaves the URL alone when %s", (_name, storage) => {
    const browser = installBrowser(RETURN_URL, { storage });

    expect(retireReturnTokenFromUrl("ORD-2026-00123")).toBe(false);
    expect(browser.location.href).toBe(RETURN_URL);
    expect(browser.replaced).toEqual([]);
  });

  it("says no when replaceState throws", () => {
    installBrowser(RETURN_URL, { replaceThrows: true });

    expect(retireReturnTokenFromUrl("ORD-2026-00123")).toBe(false);
  });

  it("says no when the token is still in the URL afterwards", () => {
    installBrowser(RETURN_URL, { replaceIgnored: true });

    expect(retireReturnTokenFromUrl("ORD-2026-00123")).toBe(false);
  });

  it("says no on the server", () => {
    expect(retireReturnTokenFromUrl("ORD-2026-00123")).toBe(false);
  });
});

describe("recallReturnToken", () => {
  it("answers per order number", () => {
    const browser = installBrowser(RETURN_URL);
    retireReturnTokenFromUrl("ORD-2026-00123");
    browser.location.href = "https://apuhanciftligi.com/odeme/basarili?no=ORD-2026-00124&t=other";
    retireReturnTokenFromUrl("ORD-2026-00124");

    expect(recallReturnToken("ORD-2026-00123")).toBe("s3cr3t-token");
    expect(recallReturnToken("ORD-2026-00124")).toBe("other");
    expect(recallReturnToken("ORD-2026-09999")).toBeNull();
  });

  it("keeps only the most recent orders", () => {
    const browser = installBrowser(RETURN_URL);
    for (let i = 0; i < 12; i += 1) {
      browser.location.href = `https://apuhanciftligi.com/odeme/basarili?no=ORD-${i}&t=token-${i}`;
      retireReturnTokenFromUrl(`ORD-${i}`);
    }

    expect(recallReturnToken("ORD-0")).toBeNull();
    expect(recallReturnToken("ORD-1")).toBeNull();
    expect(recallReturnToken("ORD-2")).toBe("token-2");
    expect(recallReturnToken("ORD-11")).toBe("token-11");
  });

  it.each([["not json"], ['{"a":1}'], ['[["ORD-1"],[1,2],"x"]']])(
    "survives a corrupted entry: %s",
    (stored) => {
      const browser = installBrowser(RETURN_URL);
      browser.localStorage.setItem("ts:card-return:v1", stored);

      expect(recallReturnToken("ORD-1")).toBeNull();
      expect(retireReturnTokenFromUrl("ORD-2026-00123")).toBe(true);
      expect(recallReturnToken("ORD-2026-00123")).toBe("s3cr3t-token");
    },
  );

  it("is null on the server", () => {
    expect(recallReturnToken("ORD-2026-00123")).toBeNull();
  });
});
