import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";

import type { TrustPage } from "./trust-page.schema";

/** Refers to the organization already emitted by the storefront layout. */
export function buildAboutPageStructuredData(page: Pick<TrustPage, "title" | "description" | "hero">) {
  const url = `${CANONICAL_ORIGIN}/hakkimizda`;
  const organization = { "@id": `${CANONICAL_ORIGIN}/#organization` };
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": `${url}#webpage`,
    url,
    name: page.title,
    description: page.description.text,
    inLanguage: "tr-TR",
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: `${CANONICAL_ORIGIN}${page.hero.src}`,
      caption: page.hero.alt,
      width: page.hero.width,
      height: page.hero.height,
    },
    about: organization,
    mainEntity: organization,
  } as const;
}
