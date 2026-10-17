import type { FulfillmentChannel } from "@/features/storefront/domain/fulfillment-channel";
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
  /** "delivery" = Malatya hand delivery only; "shipping" = cargo-capable. */
  readonly fulfillment_type: FulfillmentChannel;
}

/**
 * What checkout would actually charge to deliver, in kuruş. The caller reads
 * these from the live storefront settings and config (the same values
 * place-order.ts charges), so Google never sees a fee the basket would not.
 */
export interface OfferShippingRates {
  /** Flat eve-servis fee inside Malatya (`homeDeliveryFeeMinor`). */
  readonly homeDeliveryFeeMinor: number;
  /** Flat fee on a nationwide cargo order (`CARGO_FEE_MINOR`). */
  readonly cargoFeeMinor: number;
}

/**
 * The withdrawal period stated in the İptal ve İade Koşulları text ("malın
 * tesliminden itibaren on dört gün içinde"). A test reads the legal text, so
 * the two cannot drift apart.
 */
export const RETURN_WINDOW_DAYS = 14;

/** ISO 3166-2 code for Malatya (TR-44), country prefix dropped as Google asks. */
const DELIVERY_PROVINCE_REGION_CODE = "44";

function shippingRate(feeMinor: number) {
  return { "@type": "MonetaryAmount", value: feeMinor / 100, currency: "TRY" } as const;
}

function buildShippingDetails(
  fulfillment: FulfillmentChannel,
  rates: OfferShippingRates,
) {
  const malatyaHomeDelivery = {
    "@type": "OfferShippingDetails",
    shippingLabel: "Malatya içi eve teslimat",
    shippingRate: shippingRate(rates.homeDeliveryFeeMinor),
    shippingDestination: {
      "@type": "DefinedRegion",
      addressCountry: "TR",
      addressRegion: DELIVERY_PROVINCE_REGION_CODE,
    },
  } as const;
  // Delivery-only (fresh) goods never leave Malatya. Cargo-capable goods
  // ride along in the van inside Malatya (fulfillment-channel.ts) and go by
  // cargo everywhere else.
  if (fulfillment === "delivery") return [malatyaHomeDelivery];
  return [
    malatyaHomeDelivery,
    {
      "@type": "OfferShippingDetails",
      shippingLabel: "Türkiye geneli kargo",
      shippingRate: shippingRate(rates.cargoFeeMinor),
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "TR" },
    },
  ];
}

/**
 * Mirrors the İptal ve İade Koşulları page: a 14-day withdrawal window from
 * delivery, goods returned by the named cargo carrier. Return fees are left
 * out on purpose — the legal text still marks them as pending information.
 */
const MERCHANT_RETURN_POLICY = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: "TR",
  returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
  merchantReturnDays: RETURN_WINDOW_DAYS,
  returnMethod: "https://schema.org/ReturnByMail",
  merchantReturnLink: `${CANONICAL_ORIGIN}/iptal-iade-kosullari`,
} as const;

/** Pure Product + breadcrumbs; no invented reviews, ratings or price expiry. */
export function buildProductStructuredData(
  product: ProductStructuredDataInput,
  shippingRates: OfferShippingRates,
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
          shippingDetails: buildShippingDetails(
            product.fulfillment_type,
            shippingRates,
          ),
          hasMerchantReturnPolicy: MERCHANT_RETURN_POLICY,
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
