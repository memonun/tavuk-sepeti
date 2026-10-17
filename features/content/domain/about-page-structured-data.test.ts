import { describe, expect, it } from "vitest";

import { buildAboutPageStructuredData } from "./about-page-structured-data";
import { TRUST_CONTENT } from "./trust-pages";

const pageFor = (slug: "hakkimizda" | "ciftligimiz") =>
  TRUST_CONTENT.pages.find((item) => item.slug === slug)!;

describe.each(["hakkimizda", "ciftligimiz"] as const)("%s structured data", (slug) => {
  const page = pageFor(slug);
  const [webPage, breadcrumb] = buildAboutPageStructuredData(page)["@graph"];
  const url = `https://apuhanciftligi.com/${slug}`;

  it("matches the visible story and canonical URL", () => {
    expect(webPage["@type"]).toBe("AboutPage");
    expect(webPage.url).toBe(url);
    expect(webPage["@id"]).toBe(`${url}#webpage`);
    expect(webPage.name).toBe(page.title);
    expect(webPage.description).toBe(page.description.text);
    expect(webPage.primaryImageOfPage).toEqual({
      "@type": "ImageObject",
      url: `https://apuhanciftligi.com${page.hero.src}`,
      caption: page.hero.alt,
      width: page.hero.width,
      height: page.hero.height,
    });
  });

  it("references the existing organization without duplicating it or adding reviews", () => {
    expect(webPage.about).toEqual({ "@id": "https://apuhanciftligi.com/#organization" });
    expect(webPage.mainEntity).toEqual(webPage.about);
    for (const field of ["sameAs", "review", "aggregateRating"]) {
      expect(JSON.stringify(buildAboutPageStructuredData(page))).not.toContain(field);
    }
  });

  it("mirrors the visible Ana sayfa / title breadcrumb", () => {
    expect(breadcrumb).toEqual({
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Ana sayfa", item: "https://apuhanciftligi.com" },
        { "@type": "ListItem", position: 2, name: page.title, item: url },
      ],
    });
    expect(webPage.breadcrumb).toEqual({ "@id": breadcrumb["@id"] });
  });
});
