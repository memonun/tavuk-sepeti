import { describe, expect, it } from "vitest";

import {
  buildMerchantFeedXml,
  escapeXml,
  formatMerchantPrice,
  selectMerchantFeedItems,
  type MerchantFeedProductInput,
} from "./merchant-feed";

const product = (overrides: Partial<MerchantFeedProductInput> = {}): MerchantFeedProductInput => ({
  key: "gun-kurusu-kayisi",
  display_name: "Gün Kurusu Kayısı",
  web_slug: "gun-kurusu-kayisi",
  imageUrl: "https://example.supabase.co/storage/v1/object/public/products/kayisi.webp",
  priceMinor: 45_000,
  fulfillment_type: "shipping",
  description: "Bahçemizden gün kurusu kayısı.",
  ...overrides,
});

describe("selectMerchantFeedItems", () => {
  it("lists a cargo product with its page link and price", () => {
    const { items } = selectMerchantFeedItems([product()]);
    expect(items).toEqual([
      {
        id: "gun-kurusu-kayisi",
        title: "Gün Kurusu Kayısı",
        description: "Bahçemizden gün kurusu kayısı.",
        link: "https://apuhanciftligi.com/urun/gun-kurusu-kayisi",
        imageLink: "https://example.supabase.co/storage/v1/object/public/products/kayisi.webp",
        priceMinor: 45_000,
      },
    ]);
  });

  it("leaves out delivery-only, page-less and photo-less products, and counts why", () => {
    const { items, excluded } = selectMerchantFeedItems([
      product({ key: "eggs", fulfillment_type: "delivery" }),
      product({ key: "no-page", web_slug: null }),
      product({ key: "no-photo", imageUrl: null }),
      product({ key: "ok" }),
    ]);
    expect(items.map((item) => item.id)).toEqual(["ok"]);
    expect(excluded).toEqual({ deliveryOnly: 1, noPage: 1, noImage: 1 });
  });

  it("lists each product once", () => {
    const { items } = selectMerchantFeedItems([product(), product()]);
    expect(items).toHaveLength(1);
  });

  it("clips over-long titles and descriptions to Merchant Center's limits", () => {
    const { items } = selectMerchantFeedItems([
      product({ display_name: "K".repeat(200), description: "d".repeat(6000) }),
    ]);
    expect(items[0]!.title).toHaveLength(150);
    expect(items[0]!.title.endsWith("…")).toBe(true);
    expect(items[0]!.description).toHaveLength(5000);
  });
});

describe("formatMerchantPrice", () => {
  it("uses a dot decimal and the ISO currency", () => {
    expect(formatMerchantPrice(12_500)).toBe("125.00 TRY");
    expect(formatMerchantPrice(99)).toBe("0.99 TRY");
  });
});

describe("escapeXml", () => {
  it("escapes markup and drops characters XML forbids", () => {
    expect(escapeXml(`Kayısı & "dut" <500 g> 'özel'`)).toBe(
      "Kayısı &amp; &quot;dut&quot; &lt;500 g&gt; &apos;özel&apos;",
    );
    expect(escapeXml("a\u0000b\u0007c\td\ne")).toBe("abc\td\ne");
  });
});

describe("buildMerchantFeedXml", () => {
  const { items } = selectMerchantFeedItems([product({ display_name: "Kayısı & Dut" })]);
  const xml = buildMerchantFeedXml(items, { brand: "Apuhan Çiftliği" });

  it("is an RSS 2.0 feed in the g: namespace with every required field", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    for (const field of [
      "<g:id>gun-kurusu-kayisi</g:id>",
      "<g:title>Kayısı &amp; Dut</g:title>",
      "<g:link>https://apuhanciftligi.com/urun/gun-kurusu-kayisi</g:link>",
      "<g:availability>in_stock</g:availability>",
      "<g:price>450.00 TRY</g:price>",
      "<g:condition>new</g:condition>",
      "<g:brand>Apuhan Çiftliği</g:brand>",
      "<g:identifier_exists>no</g:identifier_exists>",
    ]) {
      expect(xml).toContain(field);
    }
    expect(xml.match(/<item>/g)).toHaveLength(1);
  });

  it("leaves shipping to the Merchant Center account settings", () => {
    expect(xml).not.toContain("g:shipping");
  });

  it("stays a valid, empty channel when nothing qualifies", () => {
    const empty = buildMerchantFeedXml([], { brand: "Apuhan Çiftliği" });
    expect(empty).toContain("<channel>");
    expect(empty).not.toContain("<item>");
  });
});
