/**
 * Pure builder for the customer order-confirmation email. No I/O — takes the
 * order facts, returns { subject, html, text }. Kept pure so it's unit-testable
 * and the sending transport (Resend) stays a thin infrastructure concern.
 *
 * Money arrives in kuruş and is formatted at this edge (CLAUDE.md §7).
 */
import { formatTRY } from "@/shared/utils/money";

export interface OrderEmailLine {
  readonly name: string;
  readonly quantity: number;
  readonly lineTotalMinor: number;
}

export interface OrderEmailInput {
  readonly orderNumber: string;
  readonly customerName: string;
  readonly scheduledFor: string;
  readonly timeSlotLabel: string | null;
  readonly paymentMethodLabel: string;
  readonly addressText: string;
  readonly items: ReadonlyArray<OrderEmailLine>;
  readonly subtotalMinor: number;
  readonly deliveryFeeMinor: number;
  readonly totalMinor: number;
}

export interface BuiltEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const formatQty = (quantity: number): string =>
  quantity.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

export function buildOrderConfirmationEmail(input: OrderEmailInput): BuiltEmail {
  const subject = `Siparişiniz alındı — ${input.orderNumber}`;
  const greetingName = input.customerName.trim();
  const greeting = greetingName ? `Merhaba ${greetingName},` : "Merhaba,";
  const deliveryFee =
    input.deliveryFeeMinor === 0 ? "Ücretsiz" : formatTRY(input.deliveryFeeMinor);
  const slot = input.timeSlotLabel ? ` (${input.timeSlotLabel})` : "";

  const itemsText = input.items
    .map(
      (i) =>
        `  - ${i.name} × ${formatQty(i.quantity)} — ${formatTRY(i.lineTotalMinor)}`,
    )
    .join("\n");

  const text = [
    greeting,
    "",
    `Siparişiniz alındı. Sipariş numaranız: ${input.orderNumber}`,
    "",
    "Ürünler:",
    itemsText,
    "",
    `Ara toplam: ${formatTRY(input.subtotalMinor)}`,
    `Teslimat: ${deliveryFee}`,
    `Toplam: ${formatTRY(input.totalMinor)}`,
    "",
    `Teslimat günü: ${input.scheduledFor}${slot}`,
    `Adres: ${input.addressText}`,
    `Ödeme: ${input.paymentMethodLabel}`,
    "",
    "Teşekkürler,",
    "Apuhan Çiftliği",
  ].join("\n");

  const itemsHtml = input.items
    .map(
      (i) => `
        <tr>
          <td style="padding:6px 0;">${escapeHtml(i.name)} × ${formatQty(i.quantity)}</td>
          <td style="padding:6px 0;text-align:right;white-space:nowrap;">${formatTRY(i.lineTotalMinor)}</td>
        </tr>`,
    )
    .join("");

  const html = `
  <div style="font-family:ui-sans-serif,system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#3a2f26;">
    <h1 style="font-size:20px;">Siparişiniz alındı 🧺</h1>
    <p>${escapeHtml(greeting)}</p>
    <p>Siparişinizi aldık. Sipariş numaranız:
      <strong>${escapeHtml(input.orderNumber)}</strong></p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
      <tbody>${itemsHtml}</tbody>
      <tfoot>
        <tr><td style="padding-top:10px;border-top:1px solid #eee;">Ara toplam</td>
            <td style="padding-top:10px;border-top:1px solid #eee;text-align:right;">${formatTRY(input.subtotalMinor)}</td></tr>
        <tr><td>Teslimat</td><td style="text-align:right;">${escapeHtml(deliveryFee)}</td></tr>
        <tr><td style="font-weight:700;padding-top:6px;">Toplam</td>
            <td style="font-weight:700;padding-top:6px;text-align:right;">${formatTRY(input.totalMinor)}</td></tr>
      </tfoot>
    </table>
    <p style="font-size:14px;">
      <strong>Teslimat günü:</strong> ${escapeHtml(input.scheduledFor)}${escapeHtml(slot)}<br/>
      <strong>Adres:</strong> ${escapeHtml(input.addressText)}<br/>
      <strong>Ödeme:</strong> ${escapeHtml(input.paymentMethodLabel)}
    </p>
    <p style="color:#8a7c6f;font-size:13px;">Teşekkürler,<br/>Apuhan Çiftliği</p>
  </div>`;

  return { subject, html, text };
}
