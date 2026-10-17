import { describe, expect, it } from "vitest";
import { LEGAL_DOCS } from "@/features/storefront/domain/legal";
import {
  buildProductStructuredData as buildWithRates,
  productPageDescription,
  RETURN_WINDOW_DAYS,
  type OfferShippingRates,
  type ProductStructuredDataInput,
} from "@/features/storefront/domain/product-structured-data";

const input = {
  key: "eggs",
  display_name: "Köy Yumurtası",
  web_description: "Çiftliğimizden taze yumurta.",
  slug: "koy-yumurtasi",
  image:
    "https://example.supabase.co/storage/v1/object/public/product-images/eggs.jpg",
  priceMinor: 12500,
  fulfillment_type: "delivery",
} as const;

const rates: OfferShippingRates = { homeDeliveryFeeMinor: 5_000, cargoFeeMinor: 0 };

const buildProductStructuredData = (product: ProductStructuredDataInput) =>
  buildWithRates(product, rates);

describe("buildProductStructuredData", () => {
  it("uses the product content, permanent SKU and real image", () => {
    const product = buildProductStructuredData(input)["@graph"][0];
    expect(product).toMatchObject({
      "@type": "Product",
      name: input.display_name,
      description: input.web_description,
      image: input.image,
      sku: "eggs",
      brand: { "@type": "Brand", name: "Apuhan Çiftliği" },
    });
    expect(JSON.stringify(product)).not.toMatch(/aggregateRating|review/);
  });

  it.each([
    [12500, "125.00"],
    [105, "1.05"],
    [12550, "125.50"],
    [11666.6667, "116.67"],
  ])("formats %s kuruş as %s TRY", (priceMinor, expected) => {
    expect(
      buildProductStructuredData({ ...input, priceMinor })["@graph"][0].offers,
    ).toMatchObject({
      "@type": "Offer",
      price: expected,
      priceCurrency: "TRY",
      availability: "https://schema.org/InStock",
      url: "https://apuhanciftligi.com/urun/koy-yumurtasi",
      seller: { "@id": "https://apuhanciftligi.com/#organization" },
    });
  });

  it("links the breadcrumb from home to the slug URL, never the English key", () => {
    expect(buildProductStructuredData(input)["@graph"][1]).toEqual({
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Ana sayfa",
          item: "https://apuhanciftligi.com",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: input.display_name,
          item: "https://apuhanciftligi.com/urun/koy-yumurtasi",
        },
      ],
    });
  });

  it("prefers the long product-page text, flattened to one line", () => {
    const product = buildProductStructuredData({
      ...input,
      web_long_description: "Serbest dolaşan tavuklar.\n\nHer sabah toplanır.",
    })["@graph"][0];
    expect(product.description).toBe("Serbest dolaşan tavuklar. Her sabah toplanır.");
  });
  it("uses a Turkish fallback description and omits an unavailable image", () => {
    const product = buildProductStructuredData({
      ...input,
      web_description: null,
      image: null,
    })["@graph"][0];
    expect(product.description).toBe(
      productPageDescription({ ...input, web_description: null }),
    );
    expect(product.description).toContain("Köy Yumurtası");
    expect(product).not.toHaveProperty("image");
  });
});

describe("Offer shipping details", () => {
  const malatya = (value: number) => ({
    "@type": "OfferShippingDetails",
    shippingLabel: "Malatya içi eve teslimat",
    shippingRate: { "@type": "MonetaryAmount", value, currency: "TRY" },
    shippingDestination: {
      "@type": "DefinedRegion",
      addressCountry: "TR",
      addressRegion: "44",
    },
  });

  it("gives a delivery-only product just the Malatya home-delivery rate", () => {
    const offer = buildProductStructuredData(input)["@graph"][0].offers;
    expect(offer.shippingDetails).toEqual([malatya(50)]);
  });

  it("gives a cargo product the Malatya rate plus nationwide cargo", () => {
    const offer = buildWithRates(
      { ...input, fulfillment_type: "shipping" },
      { homeDeliveryFeeMinor: 5_000, cargoFeeMinor: 0 },
    )["@graph"][0].offers;
    expect(offer.shippingDetails).toEqual([
      malatya(50),
      {
        "@type": "OfferShippingDetails",
        shippingLabel: "Türkiye geneli kargo",
        shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "TRY" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "TR" },
      },
    ]);
  });

  it("follows the fees it is given, never a hard-coded one", () => {
    const offer = buildWithRates(
      { ...input, fulfillment_type: "shipping" },
      { homeDeliveryFeeMinor: 7_550, cargoFeeMinor: 12_000 },
    )["@graph"][0].offers;
    expect(offer.shippingDetails.map((d) => d.shippingRate.value)).toEqual([
      75.5, 120,
    ]);
    const free = buildWithRates(input, { homeDeliveryFeeMinor: 0, cargoFeeMinor: 0 })[
      "@graph"
    ][0].offers;
    expect(free.shippingDetails).toEqual([malatya(0)]);
  });

  it("adds no price expiry, ratings or reviews", () => {
    const json = JSON.stringify(buildProductStructuredData(input));
    expect(json).not.toMatch(/priceValidUntil|aggregateRating|review/);
  });
});

describe("Offer return policy", () => {
  it("is the 14-day mail-return window from the cancellation page", () => {
    const offer = buildProductStructuredData(input)["@graph"][0].offers;
    expect(offer.hasMerchantReturnPolicy).toEqual({
      "@type": "MerchantReturnPolicy",
      applicableCountry: "TR",
      returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 14,
      returnMethod: "https://schema.org/ReturnByMail",
      merchantReturnLink: "https://apuhanciftligi.com/iptal-iade-kosullari",
    });
    // Fees are still pending in the legal text, so none are claimed.
    expect(offer.hasMerchantReturnPolicy).not.toHaveProperty("returnFees");
  });

  it("matches the withdrawal period the legal text states", () => {
    const doc = LEGAL_DOCS.find((item) => item.slug === "iptal-iade-kosullari");
    const text = doc?.sections.flatMap((section) => section.paragraphs).join(" ");
    expect(RETURN_WINDOW_DAYS).toBe(14);
    expect(text).toContain("malın tesliminden itibaren on dört gün içinde");
  });
});
