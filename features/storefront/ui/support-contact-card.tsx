import { PhoneIcon } from "lucide-react";

import { COMPANY } from "@/features/storefront/domain/legal";
import { SUPPORT_WHATSAPP_E164 } from "@/features/storefront/domain/support-contact";

/**
 * Large, unmissable "just call us" card near the bottom of the homepage — the
 * fallback for a customer who would rather talk to a person than work
 * anything out on screen. The phone number is the one real number in the
 * project (`legal.ts`'s `COMPANY.phone` — also the WhatsApp number in
 * `support-contact.ts`), not a placeholder.
 */
export function SupportContactCard() {
  return (
    <section className="mt-10 sm:mt-12">
      <a
        href={`tel:${SUPPORT_WHATSAPP_E164}`}
        className="shop-press shop-focus flex flex-col gap-4 rounded-3xl bg-primary p-5 text-primary-foreground sm:flex-row sm:items-center sm:justify-between sm:p-7"
      >
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-card text-primary">
            <PhoneIcon className="size-7" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-display text-2xl leading-tight">
              Telefonla da sipariş verebilirsiniz
            </p>
            <p className="mt-1 text-lg">Bizi arayın, yardımcı olalım.</p>
          </div>
        </div>
        <span className="inline-flex min-h-14 items-center justify-center rounded-full bg-card px-6 shop-money text-2xl font-extrabold whitespace-nowrap text-primary">
          {COMPANY.phone}
        </span>
      </a>
    </section>
  );
}
