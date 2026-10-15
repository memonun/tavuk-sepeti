/**
 * schema.org JSON-LD for every storefront page (rendered by the shop layout).
 *
 * One `@graph`: the business (Organization + LocalBusiness — a local farm that
 * delivers in Malatya and ships across Türkiye) and the WebSite it publishes.
 * Every fact is derived from COMPANY (legal.ts), the single source the footer
 * and legal texts already use, so Google sees exactly the same name, address
 * and phone as the visible page and the Google Business Profile.
 *
 * Pure: no env, no I/O.
 */
import { COMPANY } from "@/features/storefront/domain/legal";
import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";

export const STOREFRONT_DESCRIPTION =
  "Çiftlikten sofranıza taze yumurta ve süt ürünleri. Online sipariş verin, biz getirelim.";

/**
 * COMPANY.address split into schema.org PostalAddress parts. A test checks
 * that these recombine to exactly COMPANY.address, so the two cannot drift.
 */
export const COMPANY_POSTAL_ADDRESS = {
  streetAddress: "Bahri Mah. Mezarlık Cad. No: 17",
  addressLocality: "Akçadağ",
  addressRegion: "Malatya",
  addressCountry: "TR",
} as const;

/** "+90 533 255 64 44" → "+905332556444" (E.164, what schema.org expects). */
export function toE164(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export function buildStorefrontStructuredData() {
  const organizationId = `${CANONICAL_ORIGIN}/#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Organization", "LocalBusiness"],
        "@id": organizationId,
        name: COMPANY.brand,
        url: CANONICAL_ORIGIN,
        description: STOREFRONT_DESCRIPTION,
        logo: {
          "@type": "ImageObject",
          url: `${CANONICAL_ORIGIN}/brand/apuhan-ciftligi-logo.png`,
          width: 512,
          height: 512,
        },
        image: `${CANONICAL_ORIGIN}/brand/apuhan-og.png`,
        telephone: toE164(COMPANY.phone),
        email: COMPANY.email,
        address: { "@type": "PostalAddress", ...COMPANY_POSTAL_ADDRESS },
        // Home delivery in Malatya, cargo to the rest of the country.
        areaServed: [
          { "@type": "City", name: "Malatya" },
          { "@type": "Country", name: "Türkiye" },
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${CANONICAL_ORIGIN}/#website`,
        url: CANONICAL_ORIGIN,
        name: COMPANY.brand,
        description: STOREFRONT_DESCRIPTION,
        inLanguage: "tr-TR",
        publisher: { "@id": organizationId },
      },
    ],
  } as const;
}
