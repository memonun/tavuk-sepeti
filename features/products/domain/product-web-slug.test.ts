import { describe, expect, it } from "vitest";
import { deriveProductWebSlug } from "@/features/products/domain/product-web-slug";
import {
  createProductSchema,
  productWebSlugSchema,
  updateProductMetadataSchema,
} from "@/features/products/domain/product.schema";

const metadata = {
  display_name: "Köy Yumurtası",
  unit: "package",
  unit_label: "paket",
  package_size: 15,
  min_qty: 1,
  step: 1,
};

describe("product web slugs", () => {
  it.each([
    ["Köy Yumurtası", "koy-yumurtasi"],
    ["ÇĞıIİÖŞÜ çğıiöşü", "cgiiiosu-cgiiosu"],
    ["  Süt / Peynir & Yoğurt! ", "sut-peynir-yogurt"],
    ["🥚", "urun"],
  ])("derives %s using the product key transliteration rules", (name, slug) => {
    expect(deriveProductWebSlug(name)).toBe(slug);
  });

  it("reserves room for suffixes and removes trailing separators", () => {
    const name = `${"a".repeat(77)} bbbbb`;
    expect(deriveProductWebSlug(name, "2")).toBe(`${"a".repeat(77)}-2`);
    expect(deriveProductWebSlug("a".repeat(100), "123")).toHaveLength(80);
    expect(
      productWebSlugSchema.safeParse(deriveProductWebSlug(name)).success,
    ).toBe(true);
  });

  it("defaults new products to a display-name slug and respects an edited URL", () => {
    expect(createProductSchema.parse(metadata).web_slug).toBe("koy-yumurtasi");
    expect(
      createProductSchema.parse({ ...metadata, web_slug: "taze-yumurta" })
        .web_slug,
    ).toBe("taze-yumurta");
    expect(
      createProductSchema.parse({ ...metadata, display_name: "A".repeat(100) })
        .web_slug,
    ).toHaveLength(80);
    expect(
      updateProductMetadataSchema.parse({
        ...metadata,
        product_key: "eggs",
        web_slug: "taze-yumurta",
      }).web_slug,
    ).toBe("taze-yumurta");
  });

  it.each([
    "",
    "Sut",
    "süt",
    "sut peynir",
    "../eggs",
    "-sut",
    "sut-",
    "sut--peynir",
    "a".repeat(81),
    null,
  ])("rejects invalid slug %s", (web_slug) => {
    expect(productWebSlugSchema.safeParse(web_slug).success).toBe(false);
    expect(
      updateProductMetadataSchema.safeParse({
        ...metadata,
        product_key: "eggs",
        web_slug,
      }).success,
    ).toBe(false);
  });

  it("accepts 1 and 80 characters", () => {
    expect(productWebSlugSchema.parse("a")).toBe("a");
    expect(productWebSlugSchema.parse("a".repeat(80))).toHaveLength(80);
  });
});
