import { describe, expect, it } from "vitest";

import {
  buildLegalPageMetadata,
  buildPageMetadata,
  STOREFRONT_SHARE_IMAGE,
} from "@/features/storefront/application/page-metadata";
import { LEGAL_DOCS } from "@/features/storefront/domain/legal";

describe("buildPageMetadata", () => {
  const base = {
    title: "Yumurta",
    description: "Akçadağ'da gezen tavuklardan.",
    canonical: "/urun/yumurta",
  };

  it("points canonical, og:url and the social titles at the page itself", () => {
    const meta = buildPageMetadata(base);
    expect(meta.title).toBe("Yumurta");
    expect(meta.alternates?.canonical).toBe("/urun/yumurta");
    expect(meta.openGraph).toMatchObject({
      url: "/urun/yumurta",
      title: "Yumurta | Apuhan Çiftliği",
      description: base.description,
      siteName: "Apuhan Çiftliği",
      locale: "tr_TR",
      type: "website",
    });
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Yumurta | Apuhan Çiftliği",
    });
  });

  it("falls back to the default share card when there is no image", () => {
    for (const meta of [
      buildPageMetadata(base),
      buildPageMetadata({ ...base, image: null }),
    ]) {
      expect(meta.openGraph?.images).toEqual([STOREFRONT_SHARE_IMAGE]);
      expect(meta.twitter?.images).toEqual([STOREFRONT_SHARE_IMAGE.url]);
    }
  });

  it("uses the page's own image when given", () => {
    const image = { url: "https://cdn.example/yumurta.jpg", alt: "Yumurta" };
    const meta = buildPageMetadata({ ...base, image });
    expect(meta.openGraph?.images).toEqual([image]);
    expect(meta.twitter?.images).toEqual([image.url]);
  });

  it("marks article pages with their publish date", () => {
    const meta = buildPageMetadata({
      ...base,
      article: { publishedTime: "2026-10-01" },
    });
    expect(meta.openGraph).toMatchObject({
      type: "article",
      publishedTime: "2026-10-01",
    });
  });
});

describe("buildLegalPageMetadata", () => {
  it("gives every legal text its own description", () => {
    const descriptions = LEGAL_DOCS.map((doc) => {
      const meta = buildLegalPageMetadata({
        slug: doc.slug,
        canonical: `/${doc.slug}`,
      });
      expect(meta.title).toBe(doc.title);
      expect(meta.openGraph?.url).toBe(`/${doc.slug}`);
      return meta.description;
    });
    expect(new Set(descriptions).size).toBe(LEGAL_DOCS.length);
    for (const d of descriptions) expect(d?.length).toBeLessThanOrEqual(160);
  });

  it("refuses an unknown slug or a mismatched canonical", () => {
    expect(() =>
      buildLegalPageMetadata({ slug: "yok", canonical: "/yok" }),
    ).toThrow();
    expect(() =>
      buildLegalPageMetadata({ slug: "kvkk", canonical: "/gizlilik-politikasi" }),
    ).toThrow();
  });
});
