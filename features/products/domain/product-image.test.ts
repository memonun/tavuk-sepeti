import { describe, expect, it } from "vitest";

import {
  buildProductImageKey,
  imageExtForType,
  isAllowedProductImageType,
  isProductImagePath,
  productImageMimeForPath,
  productImagePublicUrl,
  productImageSiteUrl,
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

describe("isProductImagePath", () => {
  it("accepts the keys buildProductImageKey writes", () => {
    expect(isProductImagePath(buildProductImageKey("dut-pekmezi", "webp", "02c63a7dff02"))).toBe(true);
    expect(isProductImagePath("eggs/66826523a6a7.png")).toBe(true);
  });
  it("rejects traversal, other folders and other file types", () => {
    expect(isProductImagePath("../secret/a.png")).toBe(false);
    expect(isProductImagePath("eggs/../a.png")).toBe(false);
    expect(isProductImagePath("eggs/sub/a.png")).toBe(false);
    expect(isProductImagePath("eggs/a.svg")).toBe(false);
    expect(isProductImagePath("Eggs/a.png")).toBe(false);
    expect(isProductImagePath("a.png")).toBe(false);
  });
});

describe("productImageMimeForPath", () => {
  it("maps the extension back to the stored mime type", () => {
    expect(productImageMimeForPath("eggs/a.jpg")).toBe("image/jpeg");
    expect(productImageMimeForPath("eggs/a.png")).toBe("image/png");
    expect(productImageMimeForPath("eggs/a.webp")).toBe("image/webp");
    expect(productImageMimeForPath("eggs/a.gif")).toBeNull();
  });
});

describe("productImageSiteUrl", () => {
  const supabaseUrl = "https://abc.supabase.co";
  it("serves product images from the canonical domain", () => {
    expect(productImageSiteUrl("eggs/66826523a6a7.png", supabaseUrl)).toBe(
      "https://apuhanciftligi.com/urun-gorsel/eggs/66826523a6a7.png",
    );
  });
  it("returns null without an image", () => {
    expect(productImageSiteUrl(null, supabaseUrl)).toBeNull();
  });
  it("falls back to the Storage URL for a key the route would not serve", () => {
    expect(productImageSiteUrl("Odd Key/a.gif", supabaseUrl)).toBe(
      productImagePublicUrl("Odd Key/a.gif", supabaseUrl),
    );
  });
});
