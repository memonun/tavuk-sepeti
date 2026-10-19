import { describe, expect, it } from "vitest";

import { COMPANY } from "@/features/storefront/domain/legal";
import { buildLlmsTxt, type LlmsTxtInput } from "@/features/storefront/domain/llms-txt";
import { STOREFRONT_DESCRIPTION } from "@/features/storefront/domain/structured-data";

const input: LlmsTxtInput = {
  products: [
    { display_name: "Yumurta", web_slug: "yumurta", description: "Köy yumurtası.", fulfillment_type: "delivery" },
    { display_name: "Dut Pekmezi", web_slug: "dut-pekmezi", description: "Ev yapımı\npekmez.", fulfillment_type: "shipping" },
    { display_name: "Kopya", web_slug: "yumurta", description: "Aynı adres.", fulfillment_type: "delivery" },
    { display_name: "Sayfasız", web_slug: null, description: "Linki yok.", fulfillment_type: "shipping" },
  ],
  pages: [{ path: "/sss", title: "Sıkça Sorulan Sorular", description: "Teslimat ve ödeme." }],
  recipes: [{ path: "/tarifler/menemen", title: "Menemen", description: "Köy yumurtalı menemen." }],
  legal: [{ path: "/kvkk", title: "KVKK Aydınlatma Metni", description: "Kişisel veriler." }],
};

describe("buildLlmsTxt", () => {
  const text = buildLlmsTxt(input);
  const lines = text.split("\n");

  it("follows the llms.txt layout: H1, summary quote, then H2 link lists", () => {
    expect(lines[0]).toBe(`# ${COMPANY.brand}`);
    expect(lines[2]).toBe(`> ${STOREFRONT_DESCRIPTION}`);
    expect(lines.filter((line) => line.startsWith("## "))).toEqual([
      "## Ürünler",
      "## Çiftlik ve alışveriş",
      "## Tarifler",
      "## Optional",
    ]);
  });

  it("links each product page once, with its delivery scope", () => {
    expect(text).toContain(
      "- [Yumurta](https://apuhanciftligi.com/urun/yumurta): Köy yumurtası. Yalnızca Malatya içine eve teslim edilir.",
    );
    expect(text).toContain(
      "- [Dut Pekmezi](https://apuhanciftligi.com/urun/dut-pekmezi): Ev yapımı pekmez. Malatya içine eve teslim edilir, Türkiye geneline kargoyla gönderilir.",
    );
    expect(text).not.toContain("Kopya");
    expect(text).not.toContain("Sayfasız");
  });

  it("states the business identity exactly as COMPANY does", () => {
    expect(text).toContain(COMPANY.address);
    expect(text).toContain(COMPANY.phone);
    expect(text).toContain(COMPANY.email);
  });

  it("puts legal texts in the skippable Optional section, last", () => {
    expect(lines.indexOf("## Optional")).toBeLessThan(
      lines.indexOf("- [KVKK Aydınlatma Metni](https://apuhanciftligi.com/kvkk): Kişisel veriler."),
    );
  });

  it("omits a section with nothing to list", () => {
    expect(buildLlmsTxt({ ...input, products: [] })).not.toContain("## Ürünler");
  });
});
