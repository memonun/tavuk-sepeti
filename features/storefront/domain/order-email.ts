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

export interface OrderEmailBankTransfer {
  readonly iban: string;
  readonly accountHolder: string;
  readonly bankName: string;
  readonly whatsappUrl: string;
}

export interface OrderEmailInput {
  readonly orderNumber: string;
  readonly customerName: string;
  /**
   * How the order reaches the customer. A delivery names the day the van comes;
   * a cargo order deliberately does NOT — the owner dropped the "hazırlanma
   * günü" question for out-of-city parcels, so `scheduledFor` on those rows is
   * an internal ops date the customer never chose and must not be shown as a
   * promise.
   */
  readonly channel: "delivery" | "shipping";
  readonly scheduledFor: string;
  readonly timeSlotLabel: string | null;
  readonly paymentMethodLabel: string;
  readonly addressText: string;
  readonly items: ReadonlyArray<OrderEmailLine>;
  readonly subtotalMinor: number;
  readonly deliveryFeeMinor: number;
  readonly totalMinor: number;
  /** Present only when payment_method is "bank_transfer" — no gateway in
   *  Faz 1 (SPEC.md §1.3), so the IBAN + a pre-filled WhatsApp link is the
   *  entire payment instruction the customer gets. */
  readonly bankTransfer: OrderEmailBankTransfer | null;
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
  const isCargo = input.channel === "shipping";
  const deliveryFee =
    input.deliveryFeeMinor === 0 ? "Ücretsiz" : formatTRY(input.deliveryFeeMinor);
  const feeLabel = isCargo ? "Kargo" : "Teslimat";
  const slot = input.timeSlotLabel ? ` (${input.timeSlotLabel})` : "";
  const scheduleLabel = isCargo ? "Gönderim" : "Teslimat günü";
  const scheduleValue = isCargo
    ? "Siparişiniz hazırlanıp kargoya verilecektir."
    : `${input.scheduledFor}${slot}`;

  const itemsText = input.items
    .map(
      (i) =>
        `  - ${i.name} × ${formatQty(i.quantity)} — ${formatTRY(i.lineTotalMinor)}`,
    )
    .join("\n");

  const bt = input.bankTransfer;
  const bankTransferText = bt
    ? [
        "",
        "Havale/EFT bilgileri:",
        `  IBAN: ${bt.iban}`,
        `  Hesap sahibi: ${bt.accountHolder}`,
        `  Banka: ${bt.bankName}`,
        `  Açıklamaya sipariş numaranızı yazın: ${input.orderNumber}`,
        `  Dekontu WhatsApp'tan gönderin: ${bt.whatsappUrl}`,
      ]
    : [];

  const text = [
    greeting,
    "",
    `Siparişiniz alındı. Sipariş numaranız: ${input.orderNumber}`,
    "",
    "Ürünler:",
    itemsText,
    "",
    `Ara toplam: ${formatTRY(input.subtotalMinor)}`,
    `${feeLabel}: ${deliveryFee}`,
    `Toplam: ${formatTRY(input.totalMinor)}`,
    "",
    `${scheduleLabel}: ${scheduleValue}`,
    `Adres: ${input.addressText}`,
    `Ödeme: ${input.paymentMethodLabel}`,
    ...bankTransferText,
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

  const bankTransferHtml = bt
    ? `
    <div style="margin:16px 0;padding:12px 14px;border:1px solid #eee;border-radius:8px;background:#faf7f2;">
      <p style="margin:0 0 6px;font-weight:700;font-size:14px;">Havale/EFT bilgileri</p>
      <p style="margin:0;font-size:14px;line-height:1.6;">
        IBAN: <strong>${escapeHtml(bt.iban)}</strong><br/>
        Hesap sahibi: ${escapeHtml(bt.accountHolder)}<br/>
        Banka: ${escapeHtml(bt.bankName)}<br/>
        Açıklamaya sipariş numaranızı yazın: <strong>${escapeHtml(input.orderNumber)}</strong>
      </p>
      <p style="margin:10px 0 0;">
        <a href="${escapeHtml(bt.whatsappUrl)}" style="color:#1a7a4c;font-weight:600;">Dekontu WhatsApp'tan gönderin →</a>
      </p>
    </div>`
    : "";

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
        <tr><td>${escapeHtml(feeLabel)}</td><td style="text-align:right;">${escapeHtml(deliveryFee)}</td></tr>
        <tr><td style="font-weight:700;padding-top:6px;">Toplam</td>
            <td style="font-weight:700;padding-top:6px;text-align:right;">${formatTRY(input.totalMinor)}</td></tr>
      </tfoot>
    </table>
    <p style="font-size:14px;">
      <strong>${escapeHtml(scheduleLabel)}:</strong> ${escapeHtml(scheduleValue)}<br/>
      <strong>Adres:</strong> ${escapeHtml(input.addressText)}<br/>
      <strong>Ödeme:</strong> ${escapeHtml(input.paymentMethodLabel)}
    </p>
    ${bankTransferHtml}
    <p style="color:#8a7c6f;font-size:13px;">Teşekkürler,<br/>Apuhan Çiftliği</p>
  </div>`;

  return { subject, html, text };
}
