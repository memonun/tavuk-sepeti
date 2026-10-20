import { describe, expect, it } from "vitest";

import {
  buildWhatsAppOrderLink,
  buildWhatsAppOrderMessage,
} from "@/features/storefront/domain/whatsapp-order";

const LINES = [
  { name: "Köy Yumurtası", quantity: 2, unitLabel: "paket" },
  { name: "Malatya Sarı Kuru Kayısısı", quantity: 0.5, unitLabel: "kg" },
];

describe("buildWhatsAppOrderMessage", () => {
  it("writes out every line and the total", () => {
    expect(buildWhatsAppOrderMessage(LINES, 60_000)).toBe(
      [
        "Merhaba, web sitenizden sipariş vermek istiyorum:",
        "• Köy Yumurtası — 2 paket",
        "• Malatya Sarı Kuru Kayısısı — 0,5 kg",
        "Toplam: 600,00 ₺",
      ].join("\n"),
    );
  });

  it("leaves the unit out when a line has none", () => {
    expect(
      buildWhatsAppOrderMessage([{ name: "Dut Pekmezi", quantity: 3, unitLabel: "" }], 30_000),
    ).toContain("• Dut Pekmezi — 3\n");
  });

  it("still opens a conversation with an empty basket", () => {
    expect(buildWhatsAppOrderMessage([], 0)).toBe(
      "Merhaba, web sitenizden sipariş vermek istiyorum.",
    );
  });
});

describe("buildWhatsAppOrderLink", () => {
  it("opens the shop's WhatsApp with the message typed in", () => {
    const link = buildWhatsAppOrderLink(LINES, 60_000);
    expect(link.startsWith("https://wa.me/905332556444?text=")).toBe(true);
    expect(decodeURIComponent(link.split("?text=")[1] ?? "")).toBe(
      buildWhatsAppOrderMessage(LINES, 60_000),
    );
  });
});
