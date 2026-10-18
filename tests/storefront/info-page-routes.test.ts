import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ContactPage, { metadata as contactMetadata } from "@/app/(shop)/iletisim/page";
import FaqPage, { metadata as faqMetadata } from "@/app/(shop)/sss/page";
import { COMPANY } from "@/features/storefront/domain/legal";
import { buildWhatsAppLink, SUPPORT_WHATSAPP_E164 } from "@/features/storefront/domain/support-contact";
import { formatTRY } from "@/shared/utils/money";

const LIVE_SETTINGS = {
  homeDeliveryDays: [2, 6],
  homeDeliveryFeeMinor: 6_000,
  homeMinOrderMinor: 20_000,
  cargoMinOrderMinor: 90_000,
} as const;

vi.mock("@/features/storefront/application/get-storefront-settings", () => ({
  getStorefrontSettings: vi.fn(async () => LIVE_SETTINGS),
}));

/** What a crawler reads: the text of the page, entities decoded. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function jsonLd(html: string) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error("no JSON-LD");
  return JSON.parse(match[1]) as {
    "@graph": [
      { "@type": string; mainEntity: unknown; breadcrumb: { "@id": string } },
      { itemListElement: { name: string }[] },
    ];
  };
}

const squash = (text: string) => text.replace(/\s+/g, " ");

describe("/sss", () => {
  it("declares its canonical", () => {
    expect(faqMetadata.alternates?.canonical).toBe("/sss");
  });

  it("renders every FAQPage answer verbatim and the live settings", async () => {
    const html = renderToStaticMarkup(await FaqPage());
    const text = visibleText(html);
    const [faq, breadcrumb] = jsonLd(html)["@graph"];
    expect(faq["@type"]).toBe("FAQPage");
    const questions = faq.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    expect(questions.length).toBeGreaterThanOrEqual(8);
    for (const question of questions) {
      expect(text).toContain(squash(question.name));
      // Each visible paragraph is one sentence group of the JSON-LD answer.
      expect(text).toContain(squash(question.acceptedAnswer.text));
    }
    expect(text).toContain("Salı ve Cumartesi");
    expect(text).toContain(squash(formatTRY(6_000)));
    expect(text).toContain(squash(formatTRY(90_000)));
    expect(html).not.toContain("TODO");
    // The visible breadcrumb names match the BreadcrumbList.
    for (const item of breadcrumb.itemListElement) expect(text).toContain(item.name);
    expect(html.match(/<details/g)?.length).toBe(questions.length);
  });
});

describe("/iletisim", () => {
  it("declares its canonical", () => {
    expect(contactMetadata.alternates?.canonical).toBe("/iletisim");
  });

  it("shows COMPANY's identity and the WhatsApp link, plus a ContactPage", () => {
    const html = renderToStaticMarkup(createElement(ContactPage));
    const text = visibleText(html);
    for (const value of [COMPANY.brand, COMPANY.ownerName, COMPANY.address, COMPANY.phone, COMPANY.email]) {
      expect(text).toContain(value);
    }
    expect(html).toContain(`href="${buildWhatsAppLink(SUPPORT_WHATSAPP_E164)}"`);
    expect(html).toContain('href="tel:+905332556444"');
    expect(html).toContain(`href="mailto:${COMPANY.email}"`);
    const [contact, breadcrumb] = jsonLd(html)["@graph"];
    expect(contact["@type"]).toBe("ContactPage");
    for (const item of breadcrumb.itemListElement) expect(text).toContain(item.name);
    expect(html).not.toContain("TODO");
  });
});
