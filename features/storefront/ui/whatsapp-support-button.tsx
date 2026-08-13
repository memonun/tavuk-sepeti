/**
 * Site-wide floating WhatsApp support button. Unlike the havale receipt link
 * in checkout, this one is not tied to an order — it's just "reach us",
 * available on every storefront page via the shop layout.
 *
 * A plain link, not a Client Component: wa.me needs nothing but an href.
 */
import { MessageCircleIcon } from "lucide-react";

import {
  buildWhatsAppLink,
  SUPPORT_WHATSAPP_E164,
} from "@/features/storefront/domain/support-contact";

export function WhatsAppSupportButton() {
  return (
    <a
      href={buildWhatsAppLink(SUPPORT_WHATSAPP_E164, "Merhaba, bir sorum var.")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp'tan bize ulaşın"
      className="fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]"
    >
      <MessageCircleIcon className="size-7" aria-hidden />
    </a>
  );
}
