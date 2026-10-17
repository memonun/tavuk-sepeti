import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";

import type { TrustPage } from "./trust-page.schema";

/**
 * /hakkimizda and /ciftligimiz: the page itself (both tell who the business is,
 * so both are AboutPage) and the visible "Ana sayfa / {title}" breadcrumb
 * (TrustBreadcrumb). Refers to the organization already emitted by the
 * storefront layout instead of repeating it.
 */
export function buildAboutPageStructuredData(
  page: Pick<TrustPage, "slug" | "title" | "description" | "hero">,
) {
  const url = `${CANONICAL_ORIGIN}/${page.slug}`;
  const organization = { "@id": `${CANONICAL_ORIGIN}/#organization` };
  const breadcrumbId = `${url}#breadcrumb`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
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
        breadcrumb: { "@id": breadcrumbId },
        about: organization,
        mainEntity: organization,
      },
      {
        "@type": "BreadcrumbList",
        "@id": breadcrumbId,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Ana sayfa", item: CANONICAL_ORIGIN },
          { "@type": "ListItem", position: 2, name: page.title, item: url },
        ],
      },
    ],
  } as const;
}
