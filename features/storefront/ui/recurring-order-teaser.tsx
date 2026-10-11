import Link from "next/link";
import { ChevronRightIcon, RepeatIcon } from "lucide-react";

import { DELIVERY_PROVINCE } from "@/features/storefront/domain/storefront.config";
import { cn } from "@/lib/utils";

/**
 * A doorway to a different way of buying ("how", not "what"): a weekly
 * standing order. It sits on the home page's first screen, beside the
 * delivery question — the two things a returning customer decides before
 * looking at products — as one compact row the height of those buttons, so it
 * is easy to find without pushing the products down the page. A quiet kraft
 * fill, not the green outline the two delivery answers use, so it never reads
 * as a third answer to "where should we deliver".
 */
export function RecurringOrderTeaser({ className }: { className?: string | undefined }) {
  return (
    <Link
      href="/duzenli-siparis"
      className={cn(
        "shop-press-soft shop-focus flex min-h-16 items-center gap-2.5 rounded-2xl bg-secondary px-3.5 py-2",
        className,
      )}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-primary">
        <RepeatIcon className="size-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 leading-snug">
        <span className="block text-lg font-bold text-foreground">Düzenli Sipariş</span>
        {/* Kept to one line on a phone: every extra line here pushes the
            products further down the first screen. */}
        <span className="block text-base text-muted-foreground">
          {DELIVERY_PROVINCE} içi, her hafta kapınıza
        </span>
      </span>
      <ChevronRightIcon className="size-6 shrink-0 text-primary" aria-hidden />
    </Link>
  );
}
