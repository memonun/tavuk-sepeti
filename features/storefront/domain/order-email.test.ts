import { describe, expect, it } from "vitest";

import { buildOrderConfirmationEmail } from "@/features/storefront/domain/order-email";

const base = {
  orderNumber: "ORD-2026-00042",
  customerName: "Ayşe Yılmaz",
  scheduledFor: "2026-07-30",
  timeSlotLabel: "Sabah (09:00–12:00)",
  paymentMethodLabel: "Kapıda nakit ödeme",
  addressText: "Moda Cd. No: 12/3, Caferağa Mh., Kadıköy/İstanbul",
  items: [
    { name: "Yumurta", quantity: 2, lineTotalMinor: 25000 },
    { name: "Süt", quantity: 1, lineTotalMinor: 4000 },
  ],
  subtotalMinor: 29000,
  deliveryFeeMinor: 0,
  totalMinor: 29000,
} as const;

describe("buildOrderConfirmationEmail", () => {
  it("puts the order number in the subject", () => {
    expect(buildOrderConfirmationEmail(base).subject).toContain("ORD-2026-00042");
  });

  it("lists items + total and shows free delivery", () => {
    const { html, text } = buildOrderConfirmationEmail(base);
    expect(html).toContain("Yumurta");
    expect(html).toContain("Ücretsiz");
    expect(text).toContain("ORD-2026-00042");
    expect(text).toContain("Süt");
  });

  it("greets generically when the name is empty", () => {
    const { text } = buildOrderConfirmationEmail({ ...base, customerName: "" });
    expect(text).toContain("Merhaba,");
  });

  it("escapes HTML in user-provided fields", () => {
    const { html } = buildOrderConfirmationEmail({
      ...base,
      addressText: "<script>x</script>",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
