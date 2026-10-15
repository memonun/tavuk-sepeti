import { describe, expect, it } from "vitest";
import {
  buildProductStructuredData,
  productPageDescription,
} from "@/features/storefront/domain/product-structured-data";

const input = {
  key: "eggs",
  display_name: "Köy Yumurtası",
  web_description: "Çiftliğimizden taze yumurta.",
  slug: "koy-yumurtasi",
  image:
    "https://example.supabase.co/storage/v1/object/public/product-images/eggs.jpg",
  priceMinor: 12500,
};

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
    ).toEqual({
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
