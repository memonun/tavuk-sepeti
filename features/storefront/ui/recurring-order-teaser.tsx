import Link from "next/link";
import { ChevronRightIcon, RepeatIcon } from "lucide-react";

import { DELIVERY_PROVINCE } from "@/features/storefront/domain/storefront.config";

/**
 * A doorway to a different way of buying ("how", not "what"): a weekly
 * standing order. Sits below the products, as a quiet kraft band, so it never
 * reads as one more product or as a third answer to "where do you live".
 */
export function RecurringOrderTeaser() {
  return (
    <section className="mt-10 sm:mt-12">
      <Link
        href="/duzenli-siparis"
        className="shop-press shop-focus flex min-h-24 items-center gap-4 rounded-3xl bg-secondary p-4 sm:p-6"
      >
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-card text-primary">
          <RepeatIcon className="size-7" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl leading-tight text-foreground">
            Düzenli Sipariş
          </p>
          <p className="mt-1 text-base leading-relaxed text-foreground">
            Her hafta aldığınız ürünleri bir kez seçin, biz her hafta getirelim.
          </p>
          <p className="mt-1 text-base font-semibold text-muted-foreground">
            Yalnızca {DELIVERY_PROVINCE} içindeki müşterilerimiz için.
          </p>
        </div>
        <ChevronRightIcon className="size-7 shrink-0 text-primary" aria-hidden />
      </Link>
    </section>
  );
}
