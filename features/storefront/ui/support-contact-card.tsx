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
        className="flex flex-col gap-4 rounded-2xl bg-accent/60 p-5 transition-colors active:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:flex-row sm:items-center sm:justify-between sm:p-6"
      >
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <PhoneIcon className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold text-foreground sm:text-xl">
              Sipariş veya Bilgi İçin
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground sm:text-base">
              Bizi arayın, yardımcı olalım.
            </p>
          </div>
        </div>
        <span className="inline-flex min-h-12 w-fit items-center justify-center rounded-full bg-primary px-5 font-display text-lg font-bold whitespace-nowrap text-primary-foreground">
          {COMPANY.phone}
        </span>
      </a>
    </section>
  );
}
