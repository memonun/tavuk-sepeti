import { afterEach, describe, expect, it } from "vitest";

import { getMetaPixelId, isMetaPixelEnabled } from "@/shared/analytics/meta-pixel-config";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
});

describe("Meta Pixel config", () => {
  it("is OFF when the variable is unset, blank or malformed", () => {
    for (const value of [undefined, "", "  ", "abc", "12 34", "123'; x", "1234567"]) {
      if (value === undefined) delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
      else process.env.NEXT_PUBLIC_META_PIXEL_ID = value;
      expect(getMetaPixelId()).toBeNull();
      expect(isMetaPixelEnabled()).toBe(false);
    }
  });

  it("is ON for a numeric Pixel ID (surrounding whitespace ignored)", () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = " 123456789012345 ";
    expect(getMetaPixelId()).toBe("123456789012345");
    expect(isMetaPixelEnabled()).toBe(true);
  });
});
