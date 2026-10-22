import { LeafIcon, PackageIcon, ShieldCheckIcon, TruckIcon } from "lucide-react";

import { formatHomeDeliveryDays } from "@/features/storefront/domain/delivery-window";

import type { Weekday } from "@/features/storefront/domain/delivery-window";

/**
 * Four glanceable facts about buying here — large icon, short bold label, one
 * short line. The delivery-days and cargo lines are the dynamic facts in the
 * strip: both read live from `storefront_settings` (owner-editable in the
 * admin), so an admin changing the eve-servis days or the cargo fee updates
 * this card on its own — nothing hardcoded to go stale.
 */
export function TrustHighlights({
  homeDeliveryDays,
  cargoNotice,
}: {
  homeDeliveryDays: readonly Weekday[];
  /** `cargoFeeNotice(settings)` — the live cargo fee / free-shipping terms. */
  cargoNotice: string;
}) {
  const highlights = [
    {
      icon: LeafIcon,
      label: "Taze Ürünler",
      detail: "Çiftlikten sofranıza.",
    },
    {
      icon: TruckIcon,
      label: "Malatya İçi Elden Teslimat",
      detail: `${formatHomeDeliveryDays(homeDeliveryDays)} günleri.`,
    },
    {
      icon: PackageIcon,
      label: "Türkiye Geneli Kargo",
      detail: cargoNotice,
    },
    {
      icon: ShieldCheckIcon,
      label: "Güvenli Ödeme",
      detail: "PayTR ile 3D Secure ödeme.",
    },
  ] as const;

  return (
    <section aria-label="Neden Apuhan Çiftliği" className="mt-10 sm:mt-12">
      {/* Icon beside the text, not above it: on a phone this is one readable
          line per fact instead of four cramped, centred tiles. */}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {highlights.map(({ icon: Icon, label, detail }) => (
          <li
            key={label}
            className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-(--shop-green-soft) text-primary">
              <Icon className="size-6" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-lg leading-snug font-bold text-foreground">{label}</p>
              <p className="mt-0.5 text-base leading-snug text-muted-foreground">
                {detail}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
