import Link from "next/link";

import { cn } from "@/lib/utils";

import type { DeliveryScope } from "@/features/storefront/domain/catalog-filter";

/**
 * Sits right above the catalog grid: a compact, persistent "where are you"
 * switch — for the customer who scrolled straight past the homepage's big
 * scope cards and lands here first on a later visit.
 *
 * Deliberately just the two-way switch, nothing more. This used to also carry
 * a Tümü/Malatya'ya Özel/Kargolu Ürünler sub-filter and a "back to Malatya"
 * hatch, but that repeated the exact decision the customer already made with
 * the homepage's scope cards — "Kargolu Ürünler" read as a third product
 * *category* sitting next to real ones, when shipping eligibility is a
 * logistics property of the scope choice, not a thing to shop by. Once a
 * scope is picked, the grid below already shows the right slice (see
 * `filterProductsForScope`); no second, finer-grained filter is needed.
 */
export function CatalogScopeControls({ scope }: { scope: DeliveryScope | null }) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-sm font-medium text-muted-foreground">
        Teslimat tercihiniz:
      </p>
      <div
        role="group"
        aria-label="Teslimat tercihi"
        className="flex gap-2 rounded-2xl bg-secondary/50 p-1.5"
      >
        <SwitchOption
          href="/?teslimat=malatya#urunler"
          active={scope === "malatya"}
          label="Malatya İçindeyim"
        />
        <SwitchOption
          href="/?teslimat=kargo#urunler"
          active={scope === "kargo"}
          label="Malatya Dışındayım"
        />
      </div>
    </div>
  );
}

function SwitchOption({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        // 48px+ tall, roughly half-width each — large enough that a miss-tap
        // between the two options is unlikely.
        "flex min-h-12 flex-1 items-center justify-center rounded-xl px-3 text-center text-sm font-semibold transition-colors sm:text-base",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-foreground hover:bg-background/70",
      )}
    >
      {label}
    </Link>
  );
}
