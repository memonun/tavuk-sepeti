import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import type { DeliveryScope } from "@/features/storefront/domain/catalog-filter";

/**
 * The homepage's first real decision: where is the customer, so the catalog
 * below can show the right slice of it up front instead of making them find
 * out at checkout. Two big cards, not a dropdown — an older shopper should be
 * able to make this call without reading anything twice.
 *
 * Neither card is ever "locked in": both stay full-size, clickable links
 * regardless of which one is currently active (marked via `aria-current`), so
 * switching is always one tap away — from here or from the compact switcher
 * further down, above the catalog itself.
 */
export function DeliveryScopeHero({ scope }: { scope: DeliveryScope | null }) {
  return (
    <section aria-labelledby="teslimat-secim-heading" className="mt-2">
      <h2
        id="teslimat-secim-heading"
        className="font-display text-2xl leading-tight tracking-[-0.01em] text-foreground sm:text-[1.75rem]"
      >
        Ürünlerimizi size nasıl ulaştıralım?
      </h2>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ScopeCard
          href="/?teslimat=malatya#urunler"
          active={scope === "malatya"}
          emoji="📍"
          title="Malatya'dayım"
          description="Yumurta, süt ürünleri ve diğer tüm ürünleri görüntüleyin."
          cta="Malatya Ürünlerini Gör"
        />
        <ScopeCard
          href="/?teslimat=kargo#urunler"
          active={scope === "kargo"}
          emoji="📦"
          title="Malatya dışındayım"
          description="Türkiye'nin her yerine kargolanabilen ürünleri görüntüleyin."
          cta="Kargolu Ürünleri Gör"
        />
      </div>
    </section>
  );
}

function ScopeCard({
  href,
  active,
  emoji,
  title,
  description,
  cta,
}: {
  href: string;
  active: boolean;
  emoji: string;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        // Generous padding + min-height: a large, unambiguous touch target,
        // not a dense info card.
        "flex min-h-36 flex-col gap-2 rounded-2xl border-2 p-5 text-left transition-colors sm:p-6",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/50 hover:bg-secondary/40",
      )}
    >
      <span className="text-3xl" aria-hidden>
        {emoji}
      </span>
      <span className="font-display text-xl font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </span>
      <span className="text-sm leading-relaxed text-muted-foreground">
        {description}
      </span>
      <span className="mt-auto flex items-center gap-1.5 pt-2 text-sm font-semibold text-primary">
        {cta}
        <ArrowRightIcon className="size-4" aria-hidden />
      </span>
    </Link>
  );
}
