import Link from "next/link";
import { MapPinIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  CatalogFilter,
  DeliveryScope,
} from "@/features/storefront/domain/catalog-filter";

/**
 * Sits right above the catalog grid: the persistent, always-switchable
 * "where are you" control (mirrors the homepage hero, but compact — this is
 * the one a customer who scrolled straight to the products actually sees),
 * plus whichever second-level control makes sense for the current scope:
 * the Tümü/Özel/Kargolu sub-filter inside the Malatya view, or a one-tap way
 * back to it from the cargo-only view. Neither view is a dead end.
 */
export function CatalogScopeControls({
  scope,
  filter,
}: {
  scope: DeliveryScope | null;
  filter: CatalogFilter;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4">
      <DeliveryScopeSwitcher scope={scope} />
      {scope === "kargo" ? (
        <BackToMalatyaHatch />
      ) : (
        <CatalogSubFilter scope={scope} filter={filter} />
      )}
    </div>
  );
}

function DeliveryScopeSwitcher({ scope }: { scope: DeliveryScope | null }) {
  return (
    <div>
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
          emoji="📍"
          label="Malatya'dayım"
        />
        <SwitchOption
          href="/?teslimat=kargo#urunler"
          active={scope === "kargo"}
          emoji="📦"
          label="Malatya dışındayım"
        />
      </div>
    </div>
  );
}

function SwitchOption({
  href,
  active,
  emoji,
  label,
}: {
  href: string;
  active: boolean;
  emoji: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        // 48px+ tall, roughly half-width each — large enough that a miss-tap
        // between the two options is unlikely.
        "flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors sm:text-base",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-foreground hover:bg-background/70",
      )}
    >
      <span aria-hidden>{emoji}</span>
      {label}
    </Link>
  );
}

function CatalogSubFilter({
  scope,
  filter,
}: {
  scope: DeliveryScope | null;
  filter: CatalogFilter;
}) {
  const base = scope ? `/?teslimat=${scope}` : "/?";
  const sep = base.endsWith("?") ? "" : "&";

  return (
    <div
      role="group"
      aria-label="Ürün filtresi"
      className="flex flex-wrap gap-2"
    >
      <SubFilterOption href={`${base}${sep}filtre=tumu#urunler`} active={filter === "tumu"}>
        Tüm Ürünler
      </SubFilterOption>
      <SubFilterOption href={`${base}${sep}filtre=ozel#urunler`} active={filter === "ozel"}>
        Malatya&rsquo;ya Özel
      </SubFilterOption>
      <SubFilterOption href={`${base}${sep}filtre=kargo#urunler`} active={filter === "kargo"}>
        Kargolu Ürünler
      </SubFilterOption>
    </div>
  );
}

function SubFilterOption({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:border-primary/50",
      )}
    >
      {children}
    </Link>
  );
}

function BackToMalatyaHatch() {
  return (
    <Link
      href="/?teslimat=malatya#urunler"
      className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/40 p-4 text-sm transition-colors hover:bg-secondary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <MapPinIcon className="size-5 shrink-0 text-primary" aria-hidden />
      <span>
        <span className="block text-muted-foreground">
          Malatya teslimatı mı arıyorsunuz?
        </span>
        <span className="font-semibold text-foreground">
          Malatya ürünlerine geç
        </span>
      </span>
    </Link>
  );
}
