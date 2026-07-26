import { describe, expect, it } from "vitest";

import { productMetadataSchema } from "@/features/products/domain/product.schema";

const validMetadata = {
  display_name: "Kuru Dut",
  unit: "kilogram",
  unit_label: "kg",
  package_size: 1,
  min_qty: 0.5,
  step: 0.5,
};

describe("productMetadataSchema.fulfillment_type", () => {
  it("defaults to delivery when omitted (existing products stay on the route)", () => {
    expect(productMetadataSchema.parse(validMetadata).fulfillment_type).toBe(
      "delivery",
    );
  });

  it("accepts shipping", () => {
    expect(
      productMetadataSchema.parse({
        ...validMetadata,
        fulfillment_type: "shipping",
      }).fulfillment_type,
    ).toBe("shipping");
  });

  it("rejects an unknown fulfillment type", () => {
    expect(
      productMetadataSchema.safeParse({
        ...validMetadata,
        fulfillment_type: "carrier_pigeon",
      }).success,
    ).toBe(false);
  });
});
