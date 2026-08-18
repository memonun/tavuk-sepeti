/**
 * Pure builders for the two admin-notification e-mails. No I/O — mirrors
 * features/storefront/domain/order-email.ts's pattern (unit-testable,
 * transport stays a thin infrastructure concern).
 */
import { formatTRY } from "@/shared/utils/money";

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

function wrapEmail(heading: string, bodyHtml: string, bodyText: string[]): BuiltEmail {
  const text = [heading, "", ...bodyText].join("\n");
  const html = `
  <div style="font-family:ui-sans-serif,system-ui,Arial,sans-serif;max-width:520px;margin:0 auto;color:#3a2f26;">
    <h1 style="font-size:20px;">${escapeHtml(heading)}</h1>
    ${bodyHtml}
  </div>`;
  return { subject: heading, html, text };
}

export interface NewOrderNotificationEmailInput {
  readonly orderNumber: string;
  readonly customerName: string;
  readonly channel: "delivery" | "shipping";
  readonly totalMinor: number;
}

export function buildNewOrderNotificationEmail(
  input: NewOrderNotificationEmailInput,
): BuiltEmail {
  const channelLabel = input.channel === "shipping" ? "Kargo" : "Malatya içi teslimat";
  const bodyText = [
    `Sipariş no: ${input.orderNumber}`,
    `Müşteri: ${input.customerName || "—"}`,
    `Teslimat türü: ${channelLabel}`,
    `Tutar: ${formatTRY(input.totalMinor)}`,
  ];
  const bodyHtml = `
    <p style="font-size:14px;line-height:1.8;">
      Sipariş no: <strong>${escapeHtml(input.orderNumber)}</strong><br/>
      Müşteri: ${escapeHtml(input.customerName || "—")}<br/>
      Teslimat türü: ${escapeHtml(channelLabel)}<br/>
      Tutar: <strong>${escapeHtml(formatTRY(input.totalMinor))}</strong>
    </p>`;
  return wrapEmail(`Yeni sipariş — ${input.orderNumber}`, bodyHtml, bodyText);
}

export interface RecurringRequestNotificationEmailInput {
  readonly customerName: string;
  readonly cadence: "weekly" | "biweekly" | "monthly";
  readonly itemCount: number;
}

const CADENCE_LABELS: Record<
  RecurringRequestNotificationEmailInput["cadence"],
  string
> = {
  weekly: "Haftalık",
  biweekly: "İki haftada bir",
  monthly: "Aylık",
};

export function buildRecurringRequestNotificationEmail(
  input: RecurringRequestNotificationEmailInput,
): BuiltEmail {
  const cadenceLabel = CADENCE_LABELS[input.cadence];
  const bodyText = [
    `Müşteri: ${input.customerName || "—"}`,
    `Sıklık: ${cadenceLabel}`,
    `Ürün sayısı: ${input.itemCount}`,
    "",
    "Onaylamak için panelden ilgili müşteriyi açın.",
  ];
  const bodyHtml = `
    <p style="font-size:14px;line-height:1.8;">
      Müşteri: ${escapeHtml(input.customerName || "—")}<br/>
      Sıklık: ${escapeHtml(cadenceLabel)}<br/>
      Ürün sayısı: ${input.itemCount}
    </p>
    <p style="font-size:14px;">Onaylamak için panelden ilgili müşteriyi açın.</p>`;
  return wrapEmail("Yeni düzenli sipariş talebi", bodyHtml, bodyText);
}
