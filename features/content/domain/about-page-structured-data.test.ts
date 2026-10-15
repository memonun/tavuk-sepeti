import { describe, expect, it } from "vitest";

import { buildAboutPageStructuredData } from "./about-page-structured-data";
import { TRUST_CONTENT } from "./trust-pages";

const page = TRUST_CONTENT.pages.find((item) => item.slug === "hakkimizda")!;

describe("AboutPage structured data", () => {
  it("matches the visible story and canonical URL", () => {
    const data = buildAboutPageStructuredData(page);
    expect(data["@type"]).toBe("AboutPage");
    expect(data.url).toBe("https://apuhanciftligi.com/hakkimizda");
    expect(data["@id"]).toBe(`${data.url}#webpage`);
    expect(data.name).toBe(page.title);
    expect(data.description).toBe(page.description.text);
    expect(data.primaryImageOfPage).toEqual({
      "@type": "ImageObject",
      url: `https://apuhanciftligi.com${page.hero.src}`,
      caption: page.hero.alt,
      width: page.hero.width,
      height: page.hero.height,
    });
  });

  it("references the existing organization without duplicating it or adding reviews", () => {
    const data = buildAboutPageStructuredData(page);
    expect(data.about).toEqual({ "@id": "https://apuhanciftligi.com/#organization" });
    expect(data.mainEntity).toEqual(data.about);
    for (const field of ["sameAs", "review", "aggregateRating"]) {
      expect(JSON.stringify(data)).not.toContain(field);
    }
  });
});
