import { describe, expect, it } from "vitest";

import {
  buildWhatsAppLink,
  whatsAppDeliveryMessage,
} from "@/features/routing/domain/driver-contact-links";

describe("whatsAppDeliveryMessage", () => {
  it("says delivered when the stop is already done", () => {
    expect(whatsAppDeliveryMessage(true)).toBe(
      "Merhabalar, Apuhan Çiftliği siparişiniz teslim edilmiştir.",
    );
  });

  it("says in progress otherwise", () => {
    expect(whatsAppDeliveryMessage(false)).toBe(
      "Merhabalar, Apuhan Çiftliği siparişiniz teslim edilme aşamasındadır.",
    );
  });
});

describe("buildWhatsAppLink", () => {
  it("strips the E.164 + before building the wa.me link", () => {
    const url = buildWhatsAppLink("+905551234567", false);
    expect(url.startsWith("https://wa.me/905551234567?text=")).toBe(true);
  });

  it("percent-encodes the Turkish message text", () => {
    const url = buildWhatsAppLink("+905551234567", true);
    const text = new URL(url).searchParams.get("text");
    expect(text).toBe("Merhabalar, Apuhan Çiftliği siparişiniz teslim edilmiştir.");
  });

  it("strips any non-digit punctuation, not just the leading +", () => {
    const url = buildWhatsAppLink("+90 555 123 45 67", false);
    expect(url.startsWith("https://wa.me/905551234567?text=")).toBe(true);
  });
});
