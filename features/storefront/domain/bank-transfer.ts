/**
 * Havale/EFT ödeme detayları — sabit IBAN + WhatsApp deep link.
 *
 * Faz 1'de gateway entegrasyonu yok (SPEC.md §1.3: "havale ... gateway
 * entegrasyonu yok"). Akış tamamen manuel: müşteri bu IBAN'a havale yapar,
 * dekontu WhatsApp'tan gönderir, admin ödemeyi elle order-payments'a işler
 * (features/orders/application/payments.ts). Bu dosya o akışın müşteri
 * tarafındaki tek statik parçası — I/O yok, saf sabitler + bir link builder.
 */
import { formatTRY } from "@/shared/utils/money";

export const BANK_TRANSFER_IBAN = "TR57 0011 1000 0000 0120 3560 15";
/** No spaces — what actually gets copied/dialed, not what's displayed. */
export const BANK_TRANSFER_IBAN_RAW = BANK_TRANSFER_IBAN.replace(/\s/g, "");
export const BANK_TRANSFER_ACCOUNT_HOLDER = "Hamit Apuhan";
export const BANK_TRANSFER_BANK_NAME = "QNB Finansbank";

const BANK_TRANSFER_WHATSAPP_E164 = "+905332556444";

/**
 * wa.me deep link with the order number (and total, once known) pre-filled
 * into the message, so the customer only has to attach the receipt and hit
 * send, and the owner sees which order it is without having to ask.
 */
export function buildBankTransferWhatsAppLink(
  orderNumber: string,
  totalMinor?: number,
): string {
  const amountLine =
    totalMinor === undefined ? "" : ` Tutar: ${formatTRY(totalMinor)}.`;
  const text = `Merhaba, ${orderNumber} numaralı siparişim için havale dekontunu iletiyorum.${amountLine}`;
  const phoneDigits = BANK_TRANSFER_WHATSAPP_E164.replace(/\D/g, "");
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}
