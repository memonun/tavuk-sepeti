import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LEGAL_DOCS } from "@/features/storefront/domain/legal";
import { buildStorefrontSitemapEntries } from "@/features/storefront/domain/sitemap-entries";
import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";

const SHOP_DIR = join(process.cwd(), "app", "(shop)");

function pageFileFor(path: string): string {
  return path === "/"
    ? join(SHOP_DIR, "page.tsx")
    : join(SHOP_DIR, ...path.slice(1).split("/"), "page.tsx");
}

describe("buildStorefrontSitemapEntries", () => {
  const entries = buildStorefrontSitemapEntries();

  it("lists the shop, the public pages and every legal text exactly once", () => {
    const paths = entries.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("/");
    expect(paths).toContain("/siparis-sorgula");
    expect(paths).toContain("/duzenli-siparis");
    expect(paths).toContain("/hakkimizda");
    expect(paths).toContain("/ciftligimiz");
    for (const doc of LEGAL_DOCS) expect(paths).toContain(`/${doc.slug}`);
  });

  it("builds absolute URLs on the canonical origin", () => {
    for (const e of entries) {
      expect(e.url.startsWith(CANONICAL_ORIGIN), e.path).toBe(true);
      expect(new URL(e.url).pathname, e.path).toBe(e.path);
    }
  });

  it("dates legal texts with their version date", () => {
    for (const doc of LEGAL_DOCS) {
      const e = entries.find((x) => x.path === `/${doc.slug}`);
      expect(e?.lastModified).toBe(doc.updated);
      expect(doc.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("never lists account, checkout or auth pages", () => {
    const blocked = ["/giris", "/kayit", "/hesap", "/odeme", "/sifre", "/e-posta", "/auth", "/login"];
    for (const e of entries) {
      for (const prefix of blocked) expect(e.path.startsWith(prefix), e.path).toBe(false);
    }
  });

  // A listed page that canonicalises elsewhere (or not at all) sends Google
  // mixed signals. Reads the page source: canonical must be declared literally.
  it("points only at real pages that declare the same canonical path", () => {
    for (const e of entries) {
      const file = pageFileFor(e.path);
      expect(existsSync(file), file).toBe(true);
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain(`canonical: "${e.path}"`);
    }
  });
});

describe("product sitemap entries", () => {
  it("adds each catalog slug once, skipping nullable URLs", () => {
    const entries = buildStorefrontSitemapEntries([
      { web_slug: "koy-yumurtasi" }, { web_slug: "sut" },
      { web_slug: null }, { web_slug: "sut" },
    ]);
    const products = entries.filter((entry) => entry.path.startsWith("/urun/"));
    expect(products.map((entry) => entry.url)).toEqual([
      "https://apuhanciftligi.com/urun/koy-yumurtasi",
      "https://apuhanciftligi.com/urun/sut",
    ]);
    expect(products.every((entry) => entry.changeFrequency === "daily")).toBe(true);
  });
});
