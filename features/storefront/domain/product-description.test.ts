import { describe, expect, it } from "vitest";

import { splitDescriptionParagraphs } from "@/features/storefront/domain/product-description";

describe("splitDescriptionParagraphs", () => {
  it("is empty for missing or blank text", () => {
    expect(splitDescriptionParagraphs(null)).toEqual([]);
    expect(splitDescriptionParagraphs(undefined)).toEqual([]);
    expect(splitDescriptionParagraphs("  \n\n  ")).toEqual([]);
  });

  it("splits on blank lines and folds single line breaks into spaces", () => {
    const text = "Tavuklarımız serbest\ndolaşır.\n\n\nYumurtalar her sabah\r\n\r\ntoplanır.";
    expect(splitDescriptionParagraphs(text)).toEqual([
      "Tavuklarımız serbest dolaşır.",
      "Yumurtalar her sabah",
      "toplanır.",
    ]);
  });

  it("keeps markup as plain text (rendered escaped by React)", () => {
    expect(splitDescriptionParagraphs("<b>taze</b>")).toEqual(["<b>taze</b>"]);
  });
});
