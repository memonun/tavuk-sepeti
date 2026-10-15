import { splitDescriptionParagraphs } from "@/features/storefront/domain/product-description";
import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";

export function productPageDescription(product: {
  readonly display_name: string;
  readonly web_description: string | null;
}): string {
  return (
    product.web_description ||
    `${product.display_name}, Apuhan Çiftliği'nden sofranıza. Online sipariş verin.`
  );
}

export interface ProductStructuredDataInput {
  readonly key: string;
  readonly display_name: string;
  readonly web_description: string | null;
  /** Long product-page text; when set it is the richer Product description. */
  readonly web_long_description?: string | null;
  readonly slug: string;
  readonly image: string | null;
  /** The same minimum-quantity unit price displayed on the page, in kuruş. */
  readonly priceMinor: number;
}

/** Pure Product + breadcrumbs; no invented reviews or ratings. */
export function buildProductStructuredData(
  product: ProductStructuredDataInput,
) {
  const canonical = `${CANONICAL_ORIGIN}/urun/${product.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: product.display_name,
        description:
          splitDescriptionParagraphs(product.web_long_description).join(" ") ||
          productPageDescription(product),
        ...(product.image ? { image: product.image } : {}),
        sku: product.key,
        brand: { "@type": "Brand", name: "Apuhan Çiftliği" },
        offers: {
          "@type": "Offer",
          price: (product.priceMinor / 100).toFixed(2),
          priceCurrency: "TRY",
          availability: "https://schema.org/InStock",
          url: canonical,
          seller: { "@id": `${CANONICAL_ORIGIN}/#organization` },
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Ana sayfa",
            item: CANONICAL_ORIGIN,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: product.display_name,
            item: canonical,
          },
        ],
      },
    ],
  } as const;
}
