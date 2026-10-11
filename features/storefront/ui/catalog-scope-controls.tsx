import Link from "next/link";
import { CheckIcon, HouseIcon, TruckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import type { DeliveryScope } from "@/features/storefront/domain/catalog-filter";

/**
 * "Where should we deliver?" — the one filter the shop has, sitting directly
 * above the products it filters.
 *
 * This used to be asked twice: once as two half-screen cards that filled the
 * whole first screen of the homepage (so a visitor saw a question and no
 * products), and again as a small switch above the grid. It is now asked
 * once, as two large buttons, with the products already visible underneath —
 * a control belongs next to the thing it changes.
 *
 * Both are plain links to the same `?teslimat=` URLs as before, so nothing
 * about how the scope is stored, synced or parsed has changed. The chosen one
 * is marked three ways (fill, a check mark, `aria-current`), never by colour
 * alone.
 */
export function CatalogScopeControls({ scope }: { scope: DeliveryScope | null }) {
  return (
    <div>
      <p id="teslimat-secim" className="text-lg font-bold text-foreground">
        Siparişinizi nereye getirelim?
      </p>
      <div
        role="group"
        aria-labelledby="teslimat-secim"
        className="mt-3 grid grid-cols-2 gap-2.5 sm:max-w-xl sm:gap-3"
      >
        <ScopeOption
          href="/?teslimat=malatya#urunler"
          active={scope === "malatya"}
          icon={<HouseIcon aria-hidden />}
          label="Malatya içi"
        />
        <ScopeOption
          href="/?teslimat=kargo#urunler"
          active={scope === "kargo"}
          icon={<TruckIcon aria-hidden />}
          label="Başka şehir"
        />
      </div>
    </div>
  );
}

function ScopeOption({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "shop-press shop-focus flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 px-3 text-center text-lg leading-tight font-bold [&_svg]:size-6 [&_svg]:shrink-0",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-primary bg-card text-primary",
      )}
    >
      {active ? <CheckIcon aria-hidden strokeWidth={3} /> : icon}
      {label}
    </Link>
  );
}
