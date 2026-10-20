import { describe, expect, it } from "vitest";

import {
  CHECKOUT_TARGETS,
  contactProblems,
  fieldErrors,
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

const labels = (contact: GuestContactInput) => contactProblems(contact).map((p) => p.label);

describe("contactProblems", () => {
  it("is empty for a complete guest without e-mail on a non-card payment", () => {
    expect(contactProblems(CONTACT)).toEqual([]);
  });

  it("names every empty field and points at its input", () => {
    const problems = contactProblems({ ...CONTACT, firstName: " ", lastName: "", phone: "" });
    expect(problems.map((p) => p.label)).toEqual(["Ad", "Soyad", "Telefon"]);
    expect(problems.map((p) => p.target)).toEqual(["first_name", "last_name", "phone"]);
  });

  it("flags a phone the order schema would refuse", () => {
    expect(labels({ ...CONTACT, phone: "123" })).toEqual([
      "geçerli bir telefon (ör. 0532 123 45 67)",
    ]);
  });

  it("requires an e-mail only for a card payment, and says how to avoid it", () => {
    const [problem] = contactProblems({ ...CONTACT, emailRequired: true });
    expect(problem?.label).toBe("E-posta (kartla ödemede zorunlu)");
    expect(problem?.message).toContain("Havale/EFT veya Kapıda nakit");
  });

  it("flags a malformed e-mail even when optional", () => {
    expect(labels({ ...CONTACT, email: "veli@" })).toEqual(["geçerli bir e-posta"]);
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

  it("lists every step that needs something, in page order, each with where to go", () => {
    expect(
      listCheckoutMissing({
        contact: { ...CONTACT, phone: "" },
        address: {
          kind: "guest",
          complete: false,
          missing: [
            { label: "Mahalle", target: "af-neighborhood", message: "Mahallenizi yazın." },
            { label: "Daire no", target: "af-apartment", message: "Daire numaranızı yazın." },
          ],
          invalidMessage: null,
        },
        distanceSalesAccepted: false,
      }),
    ).toEqual([
      { text: "1. İletişim: Telefon eksik.", target: "phone" },
      { text: "2. Teslimat adresi: Mahalle, Daire no eksik.", target: "af-neighborhood" },
      {
        text: "Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi onay kutusunu işaretleyin.",
        target: CHECKOUT_TARGETS.distanceSales,
      },
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
    ).toEqual([
      {
        text: "2. Teslimat adresi: Bu adres teslimat bölgemizin dışında.",
        target: CHECKOUT_TARGETS.addressError,
      },
    ]);
  });

  it("asks for an address when the form has reported nothing yet", () => {
    expect(
      listCheckoutMissing({
        contact: CONTACT,
        address: { kind: "guest", complete: false, missing: [], invalidMessage: null },
        distanceSalesAccepted: true,
      }),
    ).toEqual([
      { text: "2. Teslimat adresi: adresinizi girin.", target: CHECKOUT_TARGETS.addressForm },
    ]);
  });

  it("skips the contact step for a signed-in customer", () => {
    expect(
      listCheckoutMissing({
        contact: null,
        address: { kind: "account", selected: false },
        distanceSalesAccepted: true,
      }),
    ).toEqual([
      {
        text: "2. Teslimat adresi: bir adres seçin veya yeni adres ekleyin.",
        target: CHECKOUT_TARGETS.addressPicker,
      },
    ]);
  });
});

describe("fieldErrors", () => {
  it("maps every problem field to its sentence, contact first", () => {
    expect(
      fieldErrors({ ...CONTACT, firstName: "" }, [
        { label: "Mahalle", target: "af-neighborhood", message: "Mahallenizi yazın." },
      ]),
    ).toEqual({ first_name: "Adınızı yazın.", "af-neighborhood": "Mahallenizi yazın." });
  });

  it("keeps the first sentence when two problems share a field", () => {
    expect(fieldErrors(null, [
      { label: "a", target: "x", message: "first" },
      { label: "b", target: "x", message: "second" },
    ])).toEqual({ x: "first" });
  });
});
