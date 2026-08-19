/**
 * Deep links the driver's phone-number menu offers on a stop card: call, or
 * open WhatsApp with a ready-made delivery-status message.
 *
 * `wa.me`/`api.whatsapp.com` click-to-chat accepts a `text` query param that
 * pre-fills the message box — no WhatsApp Business API integration needed.
 * The number must be digits only (no `+`, spaces, or dashes); the DB stores
 * `customer_phone` as E.164 (`+90...`), so this just strips the punctuation.
 */

/** Pure — no I/O, so it's testable without a phone number ever leaving the app. */
export function whatsAppDeliveryMessage(delivered: boolean): string {
  return delivered
    ? "Merhabalar, Apuhan Çiftliği siparişiniz teslim edilmiştir."
    : "Merhabalar, Apuhan Çiftliği siparişiniz teslim edilme aşamasındadır.";
}

export function buildWhatsAppLink(phoneE164: string, delivered: boolean): string {
  const digits = phoneE164.replace(/\D/g, "");
  const text = whatsAppDeliveryMessage(delivered);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
