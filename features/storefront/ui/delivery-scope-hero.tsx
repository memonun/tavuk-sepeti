import Link from "next/link";
import { ArrowRightIcon, CheckIcon, HouseIcon, TruckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import type { DeliveryScope } from "@/features/storefront/domain/catalog-filter";

/**
 * The homepage's first real decision, and the one this whole redesign is
 * built around: "where are you", so the catalog below can show the right
 * slice of it up front instead of making the customer find out at checkout.
 *
 * Two large cards, side by side even on the smallest phone — not a dropdown,
 * not stacked full-width — because this reads as one clear either/or choice
 * rather than a list to scan. Each is a full-size link regardless of which
 * scope is currently active (`aria-current` + a check badge mark the active
 * one), so switching is always one tap away.
 *
 * Solid primary/destructive fills are the one deliberately loud moment on an
 * otherwise quiet, cream page — everywhere else colour is reserved for the
 * products themselves. This is the exception: it is the single decision that
 * determines what a customer can even buy, so it gets to look like one.
 */
export function DeliveryScopeHero({ scope }: { scope: DeliveryScope | null }) {
  return (
    <section aria-labelledby="teslimat-secim-heading" className="mt-2">
      <h2
        id="teslimat-secim-heading"
        className="font-display text-2xl leading-tight tracking-[-0.01em] text-foreground sm:text-3xl"
      >
        Teslimat Bölgenizi Seçin
      </h2>
      <p className="mt-1.5 max-w-md text-base leading-relaxed text-muted-foreground">
        Size uygun ürünleri görüntülemek için teslimat bölgenizi seçin.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4">
        <ScopeCard
          href="/?teslimat=malatya#urunler"
          active={scope === "malatya"}
          tone="primary"
          icon={<HouseIcon className="size-8 sm:size-9" aria-hidden />}
          title="Malatya İçindeyim"
          description="Malatya içi teslim edilen ürünleri görüntüleyin."
          cta="Ürünleri Gör"
        />
        <ScopeCard
          href="/?teslimat=kargo#urunler"
          active={scope === "kargo"}
          tone="destructive"
          icon={<TruckIcon className="size-8 sm:size-9" aria-hidden />}
          title="Malatya Dışındayım"
          description="Türkiye geneline kargolanabilen ürünleri görüntüleyin."
          cta="Ürünleri Gör"
        />
      </div>
    </section>
  );
}

function ScopeCard({
  href,
  active,
  tone,
  icon,
  title,
  description,
  cta,
}: {
  href: string;
  active: boolean;
  tone: "primary" | "destructive";
  icon: React.ReactNode;
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
        // not a dense info card. White text throughout — both fills are
        // mid-lightness, saturated colours, so a single readable-on-either
        // text colour keeps this simple rather than branching per tone.
        "relative flex min-h-44 flex-col gap-2 rounded-2xl p-4 text-left text-white shadow-sm transition-transform sm:min-h-48 sm:p-6",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.98]",
        tone === "primary" ? "bg-primary" : "bg-destructive",
      )}
    >
      {active ? (
        <span
          className="absolute top-3 right-3 flex size-7 items-center justify-center rounded-full bg-white/25"
          aria-hidden
        >
          <CheckIcon className="size-4" strokeWidth={3} />
        </span>
      ) : null}
      <span className="opacity-90">{icon}</span>
      <span className="font-display text-lg leading-tight font-semibold tracking-[-0.01em] sm:text-xl">
        {title}
      </span>
      <span className="text-sm leading-snug text-white/90 sm:text-[0.95rem]">
        {description}
      </span>
      <span className="mt-auto flex items-center gap-1.5 pt-2 text-sm font-semibold sm:text-base">
        {cta}
        <ArrowRightIcon className="size-4" aria-hidden />
      </span>
    </Link>
  );
}
