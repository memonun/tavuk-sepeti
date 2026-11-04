import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHOWCASE_SLIDES,
  MAX_SHOWCASE_SLIDES,
  addShowcaseSlideSchema,
  buildShowcaseImageKey,
  isBundledShowcaseImage,
  moveSlide,
  reorderShowcaseSlidesSchema,
  showcaseImageSrc,
  showcaseSlideRowSchema,
} from "@/features/storefront/domain/showcase";

const SUPABASE = "https://abc.supabase.co/";
const ID_A = "8f1d6a2e-3b4c-4d5e-8f6a-7b8c9d0e1f2a";
const ID_B = "9a2e7b3f-4c5d-4e6f-9a7b-8c9d0e1f2a3b";
const ID_C = "0b3f8c4a-5d6e-4f7a-8b8c-9d0e1f2a3b4c";

describe("showcaseImageSrc", () => {
  it("serves a bundled photo from the site itself", () => {
    expect(showcaseImageSrc("/brand/apuhan-acilis-masa.webp", SUPABASE)).toBe(
      "/brand/apuhan-acilis-masa.webp",
    );
  });

  it("serves an uploaded photo from the public showcase bucket", () => {
    expect(showcaseImageSrc("ab12cd34.webp", SUPABASE)).toBe(
      "https://abc.supabase.co/storage/v1/object/public/showcase-images/ab12cd34.webp",
    );
  });
});

describe("isBundledShowcaseImage / buildShowcaseImageKey", () => {
  it("tells site files from bucket keys", () => {
    expect(isBundledShowcaseImage("/hakkimizda/inek.webp")).toBe(true);
    expect(isBundledShowcaseImage(buildShowcaseImageKey("ab12", "jpg"))).toBe(false);
    expect(buildShowcaseImageKey("ab12", "jpg")).toBe("ab12.jpg");
  });
});

describe("showcaseSlideRowSchema", () => {
  const row = { id: ID_A, image_path: "ab12.webp", image_alt: "Tavuklar", focus_y: 50 };

  it("accepts the two path shapes the table allows", () => {
    expect(showcaseSlideRowSchema.safeParse(row).success).toBe(true);
    expect(
      showcaseSlideRowSchema.safeParse({ ...row, image_path: "/brand/apuhan-acilis-masa.webp" }).success,
    ).toBe(true);
  });

  // A row must never point the home page at an arbitrary address or another bucket.
  it("refuses any other image path", () => {
    for (const bad of [
      "https://evil.example/x.webp",
      "../product-images/eggs/a.webp",
      "/brand/../secret.webp",
      "/uploads/x.webp",
      "folder/ab12.webp",
      "ab12.gif",
    ]) {
      expect(showcaseSlideRowSchema.safeParse({ ...row, image_path: bad }).success, bad).toBe(false);
    }
  });

  it("refuses a focus outside 0..100", () => {
    expect(showcaseSlideRowSchema.safeParse({ ...row, focus_y: 101 }).success).toBe(false);
    expect(showcaseSlideRowSchema.safeParse({ ...row, focus_y: -1 }).success).toBe(false);
  });

  it("keeps the launch photos valid rows", () => {
    for (const slide of DEFAULT_SHOWCASE_SLIDES) {
      expect(
        showcaseSlideRowSchema.safeParse({
          id: ID_A,
          image_path: slide.imagePath,
          image_alt: slide.imageAlt,
          focus_y: slide.focusY,
        }).success,
        slide.imagePath,
      ).toBe(true);
    }
  });
});

describe("addShowcaseSlideSchema", () => {
  it("trims the description and coerces the form's focus string", () => {
    expect(addShowcaseSlideSchema.parse({ image_alt: "  Masa  ", focus_y: "72" })).toEqual({
      image_alt: "Masa",
      focus_y: 72,
    });
  });

  it("refuses a blank or missing description", () => {
    expect(addShowcaseSlideSchema.safeParse({ image_alt: "   ", focus_y: "50" }).success).toBe(false);
    expect(addShowcaseSlideSchema.safeParse({ image_alt: null, focus_y: "50" }).success).toBe(false);
  });
});

describe("reorderShowcaseSlidesSchema", () => {
  it("refuses the same photo twice", () => {
    expect(reorderShowcaseSlidesSchema.safeParse({ ids: [ID_A, ID_A] }).success).toBe(false);
  });

  it(`refuses more than ${MAX_SHOWCASE_SLIDES} photos`, () => {
    const ids = Array.from({ length: MAX_SHOWCASE_SLIDES + 1 }, (_, i) =>
      `${String(i).padStart(8, "0")}-3b4c-4d5e-8f6a-7b8c9d0e1f2a`,
    );
    expect(reorderShowcaseSlidesSchema.safeParse({ ids }).success).toBe(false);
  });
});

describe("moveSlide", () => {
  const ids = [ID_A, ID_B, ID_C];

  it("swaps a photo with its neighbour", () => {
    expect(moveSlide(ids, ID_B, -1)).toEqual([ID_B, ID_A, ID_C]);
    expect(moveSlide(ids, ID_B, 1)).toEqual([ID_A, ID_C, ID_B]);
  });

  it("leaves the order alone at either end or for an unknown id", () => {
    expect(moveSlide(ids, ID_A, -1)).toEqual(ids);
    expect(moveSlide(ids, ID_C, 1)).toEqual(ids);
    expect(moveSlide(ids, "nope", 1)).toEqual(ids);
  });
});
