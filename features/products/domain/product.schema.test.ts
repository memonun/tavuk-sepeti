import { describe, expect, it } from "vitest";

import {
  createProductSchema,
  productMetadataSchema,
  updateProductMetadataSchema,
} from "@/features/products/domain/product.schema";

const validMetadata = {
  display_name: "Köy Yumurtası",
  unit: "package",
  unit_label: "paket (15 adet)",
  package_size: "15",
  min_qty: "1",
  step: "1",
};

describe("productMetadataSchema", () => {
  it("accepts valid metadata and coerces numeric strings", () => {
    const parsed = productMetadataSchema.parse({
      ...validMetadata,
      package_size: "0.5",
      min_qty: "0.5",
      step: "0.5",
    });
    expect(parsed.package_size).toBe(0.5);
    expect(parsed.min_qty).toBe(0.5);
    expect(parsed.step).toBe(0.5);
    expect(parsed.display_name).toBe("Köy Yumurtası");
    expect(parsed.unit).toBe("package");
  });

  it("trims display_name and unit_label", () => {
    const parsed = productMetadataSchema.parse({
      ...validMetadata,
      display_name: "  Süt  ",
      unit_label: "  litre  ",
    });
    expect(parsed.display_name).toBe("Süt");
    expect(parsed.unit_label).toBe("litre");
  });

  it.each(["package_size", "min_qty", "step"] as const)(
    "rejects non-positive %s",
    (field) => {
      expect(
        productMetadataSchema.safeParse({ ...validMetadata, [field]: "0" })
          .success,
      ).toBe(false);
      expect(
        productMetadataSchema.safeParse({ ...validMetadata, [field]: "-1" })
          .success,
      ).toBe(false);
    },
  );

  it("rejects an empty display_name", () => {
    expect(
      productMetadataSchema.safeParse({ ...validMetadata, display_name: "" })
        .success,
    ).toBe(false);
    expect(
      productMetadataSchema.safeParse({ ...validMetadata, display_name: "   " })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown unit", () => {
    expect(
      productMetadataSchema.safeParse({ ...validMetadata, unit: "carton" })
        .success,
    ).toBe(false);
  });
});

describe("createProductSchema", () => {
  it("defaults base_price_minor to 0 when omitted", () => {
    const parsed = createProductSchema.parse(validMetadata);
    expect(parsed.base_price_minor).toBe(0);
  });

  it("rejects a negative base price", () => {
    expect(
      createProductSchema.safeParse({
        ...validMetadata,
        base_price_minor: -100,
      }).success,
    ).toBe(false);
  });
});

describe("updateProductMetadataSchema", () => {
  it("requires a product_key", () => {
    expect(updateProductMetadataSchema.safeParse(validMetadata).success).toBe(
      false,
    );
    expect(
      updateProductMetadataSchema.safeParse({
        ...validMetadata,
        product_key: "eggs",
      }).success,
    ).toBe(true);
  });
});
