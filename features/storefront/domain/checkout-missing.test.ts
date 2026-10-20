import { describe, expect, it } from "vitest";

import {
  contactProblems,
  listCheckoutMissing,
  type GuestContactInput,
} from "@/features/storefront/domain/checkout-missing";

const CONTACT: GuestContactInput = {
  firstName: "Veli",
  lastName: "Demir",
  phone: "0532 111 22 33",
  email: "",
  emailRequired: false,
};

describe("contactProblems", () => {
  it("is empty for a complete guest without e-mail on a non-card payment", () => {
    expect(contactProblems(CONTACT)).toEqual([]);
  });

  it("names every empty field", () => {
    expect(
      contactProblems({ ...CONTACT, firstName: " ", lastName: "", phone: "" }),
    ).toEqual(["Ad", "Soyad", "Telefon"]);
  });

  it("flags a phone the order schema would refuse", () => {
    expect(contactProblems({ ...CONTACT, phone: "123" })).toEqual([
      "geçerli bir telefon (ör. 0532 123 45 67)",
    ]);
  });

  it("requires an e-mail only for a card payment", () => {
    expect(contactProblems({ ...CONTACT, emailRequired: true })).toEqual([
      "E-posta (kartla ödemede zorunlu)",
    ]);
  });

  it("flags a malformed e-mail even when optional", () => {
    expect(contactProblems({ ...CONTACT, email: "veli@" })).toEqual([
      "geçerli bir e-posta",
    ]);
  });
});

describe("listCheckoutMissing", () => {
  it("is empty when everything is in place", () => {
    expect(
      listCheckoutMissing({
        contact: CONTACT,
        address: { kind: "guest", complete: true, missing: [], invalidMessage: null },
        distanceSalesAccepted: true,
      }),
    ).toEqual([]);
  });

  it("lists every step that needs something, in page order", () => {
    expect(
      listCheckoutMissing({
        contact: { ...CONTACT, phone: "" },
        address: {
          kind: "guest",
          complete: false,
          missing: ["Mahalle", "Daire no (müstakil evse kutuyu işaretleyin)"],
          invalidMessage: null,
        },
        distanceSalesAccepted: false,
      }),
    ).toEqual([
      "1. İletişim: Telefon eksik.",
      "2. Teslimat adresi: Mahalle, Daire no (müstakil evse kutuyu işaretleyin) eksik.",
      "Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi onay kutusunu işaretleyin.",
    ]);
  });

  it("passes the server's reason for a refused guest address through", () => {
    expect(
      listCheckoutMissing({
        contact: CONTACT,
        address: {
          kind: "guest",
          complete: true,
          missing: [],
          invalidMessage: "Bu adres teslimat bölgemizin dışında.",
        },
        distanceSalesAccepted: true,
      }),
    ).toEqual(["2. Teslimat adresi: Bu adres teslimat bölgemizin dışında."]);
  });

  it("asks for an address when the form has reported nothing yet", () => {
    expect(
      listCheckoutMissing({
        contact: CONTACT,
        address: { kind: "guest", complete: false, missing: [], invalidMessage: null },
        distanceSalesAccepted: true,
      }),
    ).toEqual(["2. Teslimat adresi: adresinizi girin."]);
  });

  it("skips the contact step for a signed-in customer", () => {
    expect(
      listCheckoutMissing({
        contact: null,
        address: { kind: "account", selected: false },
        distanceSalesAccepted: true,
      }),
    ).toEqual(["2. Teslimat adresi: bir adres seçin veya yeni adres ekleyin."]);
  });
});
