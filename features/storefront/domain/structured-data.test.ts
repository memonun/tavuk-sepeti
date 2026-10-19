import { describe, expect, it } from "vitest";

import { COMPANY } from "@/features/storefront/domain/legal";
import {
  buildStorefrontStructuredData,
  COMPANY_POSTAL_ADDRESS,
  FOUNDER_PERSON,
  STOREFRONT_DESCRIPTION,
  toE164,
} from "@/features/storefront/domain/structured-data";
import { SUPPORT_WHATSAPP_E164 } from "@/features/storefront/domain/support-contact";

describe("buildStorefrontStructuredData", () => {
  const data = buildStorefrontStructuredData();
  const [business, website] = data["@graph"];

  it("keeps the stable @ids other nodes (and Google) refer to", () => {
    expect(business["@id"]).toBe("https://apuhanciftligi.com/#organization");
    expect(website["@id"]).toBe("https://apuhanciftligi.com/#website");
    expect(website.publisher["@id"]).toBe(business["@id"]);
  });

  it("describes the farm as a local business with the footer's NAP", () => {
    expect(business["@type"]).toEqual(["Organization", "LocalBusiness"]);
    expect(business.name).toBe(COMPANY.brand);
    expect(business.email).toBe(COMPANY.email);
    expect(business.telephone).toBe(SUPPORT_WHATSAPP_E164);
    expect(business.address["@type"]).toBe("PostalAddress");
  });

  it("serves Malatya locally and Türkiye by cargo", () => {
    expect(business.areaServed.map((a) => a.name)).toEqual(["Malatya", "Türkiye"]);
  });

  it("links the verified Instagram account and names the owner as founder", () => {
    expect(business.sameAs).toEqual(["https://www.instagram.com/mr.apuhan/"]);
    expect(business.founder).toEqual({
      "@type": "Person",
      "@id": "https://apuhanciftligi.com/#founder",
      name: COMPANY.ownerName,
    });
    expect(FOUNDER_PERSON.name).toBe("Hamit Apuhan");
  });

  it("keeps the shared description short enough not to be cut in results", () => {
    expect([...STOREFRONT_DESCRIPTION].length).toBeLessThanOrEqual(155);
  });

  it("serialises to JSON without a closing script tag", () => {
    expect(JSON.stringify(data)).not.toMatch(/<\/script/i);
  });
});

describe("COMPANY_POSTAL_ADDRESS", () => {
  // Fails when COMPANY.address is edited without updating the schema parts.
  it("recombines to exactly COMPANY.address", () => {
    const { streetAddress, addressLocality, addressRegion } = COMPANY_POSTAL_ADDRESS;
    expect(`${streetAddress}, ${addressLocality} / ${addressRegion}`).toBe(COMPANY.address);
  });
});

describe("toE164", () => {
  it("strips spacing and punctuation", () => {
    expect(toE164("+90 533 255 64 44")).toBe("+905332556444");
    expect(toE164("+90 (533) 255-64-44")).toBe("+905332556444");
  });
});
