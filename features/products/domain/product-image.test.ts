import { describe, expect, it } from "vitest";

import {
  buildProductImageKey,
  imageExtForType,
  isAllowedProductImageType,
  productImagePublicUrl,
} from "@/features/products/domain/product-image";

describe("isAllowedProductImageType", () => {
  it("accepts jpeg/png/webp and rejects others", () => {
    expect(isAllowedProductImageType("image/jpeg")).toBe(true);
    expect(isAllowedProductImageType("image/png")).toBe(true);
    expect(isAllowedProductImageType("image/webp")).toBe(true);
    expect(isAllowedProductImageType("image/gif")).toBe(false);
    expect(isAllowedProductImageType("application/pdf")).toBe(false);
  });
});

describe("imageExtForType", () => {
  it("maps mime types to extensions", () => {
    expect(imageExtForType("image/jpeg")).toBe("jpg");
    expect(imageExtForType("image/png")).toBe("png");
    expect(imageExtForType("image/webp")).toBe("webp");
  });
  it("returns null for unknown types", () => {
    expect(imageExtForType("image/gif")).toBeNull();
  });
});

describe("buildProductImageKey", () => {
  it("namespaces by product key and adds the extension", () => {
    expect(buildProductImageKey("eggs", "webp", "ab12")).toBe("eggs/ab12.webp");
  });
});

describe("productImagePublicUrl", () => {
  it("returns null when there is no image", () => {
    expect(productImagePublicUrl(null, "https://x.supabase.co")).toBeNull();
  });

  it("builds the public object URL", () => {
    expect(
      productImagePublicUrl("eggs/ab12.webp", "https://x.supabase.co"),
    ).toBe(
      "https://x.supabase.co/storage/v1/object/public/product-images/eggs/ab12.webp",
    );
  });

  it("tolerates a trailing slash on the base url", () => {
    expect(productImagePublicUrl("a.webp", "https://x.supabase.co/")).toBe(
      "https://x.supabase.co/storage/v1/object/public/product-images/a.webp",
    );
  });
});
