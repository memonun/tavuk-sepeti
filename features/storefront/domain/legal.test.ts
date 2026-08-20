import { describe, expect, it } from "vitest";

import {
  CONTRACTED_CARGO_CARRIER,
  LEGAL_DOCS,
  SALES_LEGAL_ACCEPTANCE_DOCUMENTS,
  SELLER_IDENTITY_LINES,
  createSalesLegalAcceptance,
  getLegalDoc,
} from "@/features/storefront/domain/legal";

describe("sales legal acceptance", () => {
  it("records the two accepted document versions with the supplied timestamp", () => {
    expect(createSalesLegalAcceptance(new Date("2026-08-18T12:00:00.000Z"))).toEqual({
      accepted_at: "2026-08-18T12:00:00.000Z",
      documents: SALES_LEGAL_ACCEPTANCE_DOCUMENTS,
    });
  });

  it("exposes the new recurring-order terms page", () => {
    expect(getLegalDoc("duzenli-siparis-kosullari")?.title).toBe(
      "Düzenli Sipariş Koşulları",
    );
  });

  it("keeps the verified seller identity and pending official fields consistent", () => {
    const requiredDocs = [
      "mesafeli-satis-sozlesmesi",
      "on-bilgilendirme-formu",
      "kvkk",
      "gizlilik-politikasi",
      "iptal-iade-kosullari",
      "kullanim-sartlari",
      "teslimat-kosullari",
      "duzenli-siparis-kosullari",
    ];

    for (const slug of requiredDocs) {
      const doc = getLegalDoc(slug);
      const paragraphs = doc?.sections.flatMap((section) => section.paragraphs) ?? [];
      expect(paragraphs).toEqual(expect.arrayContaining([...SELLER_IDENTITY_LINES]));
    }
  });

  it("exposes the transaction guide with public order and privacy links", () => {
    const guide = getLegalDoc("islem-rehberi");
    const links = guide?.sections.flatMap((section) => section.links ?? []) ?? [];

    expect(guide?.title).toBe("İşlem Rehberi");
    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/siparis-sorgula" }),
        expect.objectContaining({ href: "/kvkk" }),
        expect.objectContaining({ href: "/gizlilik-politikasi" }),
        expect.objectContaining({ href: "/cerez-politikasi" }),
      ]),
    );
    expect(LEGAL_DOCS.map((doc) => doc.slug)).toContain("islem-rehberi");
  });

  it("publishes the contracted Aras Kargo carrier in delivery and privacy texts", () => {
    const requiredDocs = [
      "mesafeli-satis-sozlesmesi",
      "on-bilgilendirme-formu",
      "teslimat-kosullari",
      "iptal-iade-kosullari",
      "gizlilik-politikasi",
      "kvkk",
    ];

    for (const slug of requiredDocs) {
      const doc = getLegalDoc(slug);
      const paragraphs = doc?.sections.flatMap((section) => section.paragraphs) ?? [];
      expect(paragraphs.join(" ")).toContain(CONTRACTED_CARGO_CARRIER);
    }

    const returnDoc = getLegalDoc("iptal-iade-kosullari");
    const returnText = returnDoc?.sections.flatMap((section) => section.paragraphs).join(" ") ?? "";
    expect(returnText).toContain("Öngörülen İade Taşıyıcısı: Aras Kargo");
    expect(returnText).toContain("İade Gönderim Masrafı: sonra eklenicek");
  });
});
