import { describe, expect, it } from "vitest";

import { composeCargoRecipient } from "@/features/cargo/domain/cargo-recipient";

describe("composeCargoRecipient", () => {
  it("joins first + last name and passes phone through as stored", () => {
    const r = composeCargoRecipient({
      orderId: "o1",
      firstName: "Ayşe",
      lastName: "Yılmaz",
      phone: "+905321234567",
      snapshot: { raw_text: "Atatürk Mah. 5. Sok. No:3 D:2, Battalgazi / Malatya" },
    });
    expect(r).toEqual({
      orderId: "o1",
      name: "Ayşe Yılmaz",
      phone: "+905321234567",
      address: "Atatürk Mah. 5. Sok. No:3 D:2, Battalgazi / Malatya",
      addressNote: null,
    });
  });

  it("keeps the name even when only one part is on file", () => {
    expect(
      composeCargoRecipient({
        orderId: "o2",
        firstName: "  ",
        lastName: "Demir",
        phone: null,
        snapshot: {},
      }),
    ).toMatchObject({ name: "Demir", phone: null });
  });

  it("returns '—' for both name and address when nothing is on file", () => {
    expect(
      composeCargoRecipient({
        orderId: "o3",
        firstName: null,
        lastName: undefined,
        phone: "",
        snapshot: null,
      }),
    ).toEqual({
      orderId: "o3",
      name: "—",
      phone: null,
      address: "—",
      addressNote: null,
    });
  });

  it("falls back to the snapshot description when raw_text is missing", () => {
    const r = composeCargoRecipient({
      orderId: "o4",
      firstName: "Mehmet",
      lastName: "Kaya",
      phone: "+905441112233",
      snapshot: { description: "Kırmızı apartman, market yanı" },
    });
    expect(r.address).toBe("Kırmızı apartman, market yanı");
    expect(r.addressNote).toBeNull();
  });

  it("surfaces the description as a note when it is additional to raw_text", () => {
    const r = composeCargoRecipient({
      orderId: "o5",
      firstName: "Zeynep",
      lastName: "Ak",
      phone: "+905339998877",
      snapshot: {
        raw_text: "İnönü Cad. No:12, Yeşilyurt / Malatya",
        description: "Zili çalışmıyor, arayın",
      },
    });
    expect(r.address).toBe("İnönü Cad. No:12, Yeşilyurt / Malatya");
    expect(r.addressNote).toBe("Zili çalışmıyor, arayın");
  });

  it("ignores non-string snapshot fields", () => {
    const r = composeCargoRecipient({
      orderId: "o6",
      firstName: "Ali",
      lastName: "Vural",
      phone: 5321234567,
      snapshot: { raw_text: 42, description: ["x"] },
    });
    expect(r).toMatchObject({ phone: null, address: "—", addressNote: null });
  });
});
