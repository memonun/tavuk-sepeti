import { describe, expect, it } from "vitest";

import { publishedFaqItems } from "./info-page.schema";
import {
  buildContactPageStructuredData,
  buildFaqPageStructuredData,
} from "./info-page-structured-data";
import { buildFaqPage, CONTACT_PAGE } from "./info-pages";
import { DEFAULT_STOREFRONT_SETTINGS } from "./storefront-settings";

const ORIGIN = "https://apuhanciftligi.com";
const ORGANIZATION = { "@id": `${ORIGIN}/#organization` };

const breadcrumbFor = (slug: string, title: string) => ({
  "@type": "BreadcrumbList",
  "@id": `${ORIGIN}/${slug}#breadcrumb`,
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Ana sayfa", item: ORIGIN },
    { "@type": "ListItem", position: 2, name: title, item: `${ORIGIN}/${slug}` },
  ],
});

/** No second copy of the business: no Organization/LocalBusiness node, no address/phone. */
function expectNoDuplicatedOrganization(data: unknown) {
  const json = JSON.stringify(data);
  for (const field of ['"Organization"', '"LocalBusiness"', "telephone", "address", "sameAs", "geo", "review", "aggregateRating"]) {
    expect(json).not.toContain(field);
  }
}

describe("buildContactPageStructuredData", () => {
  const data = buildContactPageStructuredData(CONTACT_PAGE);
  const [webPage, breadcrumb] = data["@graph"];

  it("describes /iletisim as a ContactPage on its canonical URL", () => {
    expect(webPage).toMatchObject({
      "@type": "ContactPage",
      "@id": `${ORIGIN}/iletisim#webpage`,
      url: `${ORIGIN}/iletisim`,
      name: CONTACT_PAGE.title,
      description: CONTACT_PAGE.description,
      inLanguage: "tr-TR",
    });
  });

  it("references the existing organization by @id instead of repeating it", () => {
    expect(webPage.about).toEqual(ORGANIZATION);
    expect(webPage.mainEntity).toEqual(ORGANIZATION);
    expectNoDuplicatedOrganization(data);
  });

  it("mirrors the visible Ana sayfa / İletişim breadcrumb", () => {
    expect(breadcrumb).toEqual(breadcrumbFor("iletisim", CONTACT_PAGE.title));
    expect(webPage.breadcrumb).toEqual({ "@id": breadcrumb["@id"] });
  });
});

describe("buildFaqPageStructuredData", () => {
  const page = buildFaqPage(DEFAULT_STOREFRONT_SETTINGS);
  const data = buildFaqPageStructuredData(page);
  const [webPage, breadcrumb] = data["@graph"];

  it("lists exactly the rendered questions with their visible answer text", () => {
    expect(webPage["@type"]).toBe("FAQPage");
    expect(webPage.url).toBe(`${ORIGIN}/sss`);
    expect(webPage.mainEntity).toEqual(
      publishedFaqItems(page).map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer.join(" ") },
      })),
    );
  });

  it("leaves owner TODO questions out", () => {
    const todoQuestions = page.items.filter((item) => item.status === "owner-todo").map((item) => item.question);
    const names = webPage.mainEntity.map((question) => question.name);
    for (const question of todoQuestions) expect(names).not.toContain(question);
    expect(JSON.stringify(data)).not.toContain("TODO");
  });

  it("references the organization and mirrors the visible breadcrumb", () => {
    expect(webPage.about).toEqual(ORGANIZATION);
    expectNoDuplicatedOrganization(data);
    expect(breadcrumb).toEqual(breadcrumbFor("sss", page.title));
    expect(webPage.breadcrumb).toEqual({ "@id": breadcrumb["@id"] });
  });
});
