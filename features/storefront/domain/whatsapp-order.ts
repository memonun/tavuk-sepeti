/**
 * "WhatsApp'tan sipariş ver": the basket, written out as a message.
 *
 * Owner decision 2026-10-20. Most of our customers are 50+, and a form they get
 * stuck on is an order lost. The checkout therefore offers a way out at the top
 * and next to every error: WhatsApp opens with the basket already typed, so the
 * customer only has to press send and we take the order by hand.
 *
 * Pure and client-safe. Names and quantities only — nothing the customer typed
 * into the form (address, phone) is put into the link.
 */
import { formatTRY } from "@/shared/utils/money";

import { buildWhatsAppLink, SUPPORT_WHATSAPP_E164 } from "@/features/storefront/domain/support-contact";

export interface WhatsAppOrderLine {
  readonly name: string;
  readonly quantity: number;
  /** "kg", "paket"… — empty for a plain count. */
  readonly unitLabel: string;
}

function quantityText(line: WhatsAppOrderLine): string {
  const amount = line.quantity.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  return line.unitLabel ? `${amount} ${line.unitLabel}` : amount;
}

export function buildWhatsAppOrderMessage(
  lines: readonly WhatsAppOrderLine[],
  totalMinor: number,
): string {
  if (lines.length === 0) {
    return "Merhaba, web sitenizden sipariş vermek istiyorum.";
  }
  return [
    "Merhaba, web sitenizden sipariş vermek istiyorum:",
    ...lines.map((line) => `• ${line.name} — ${quantityText(line)}`),
    `Toplam: ${formatTRY(totalMinor)}`,
  ].join("\n");
}

export function buildWhatsAppOrderLink(
  lines: readonly WhatsAppOrderLine[],
  totalMinor: number,
): string {
  return buildWhatsAppLink(SUPPORT_WHATSAPP_E164, buildWhatsAppOrderMessage(lines, totalMinor));
}
