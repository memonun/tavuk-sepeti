import { LeafIcon, PackageIcon, ShieldCheckIcon, TruckIcon } from "lucide-react";

import { formatHomeDeliveryDays } from "@/features/storefront/domain/delivery-window";
import { CARGO_FREE_SHIPPING_NOTICE } from "@/features/storefront/domain/storefront.config";

import type { Weekday } from "@/features/storefront/domain/delivery-window";

/**
 * Four glanceable facts about buying here — large icon, short bold label, one
 * short line. The delivery-days line is the one dynamic fact in the strip:
 * it reads live from `storefront_settings` (owner-editable in the admin), so
 * an admin changing the eve-servis days updates this card on its own — no
 * hardcoded "Çarşamba ve Cumartesi" to go stale the next time the owner
 * changes the schedule.
 */
export function TrustHighlights({
  homeDeliveryDays,
}: {
  homeDeliveryDays: readonly Weekday[];
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
      detail: CARGO_FREE_SHIPPING_NOTICE,
    },
    {
      icon: ShieldCheckIcon,
      label: "Güvenli Ödeme",
      detail: "PayTR ile 3D Secure ödeme.",
    },
  ] as const;

  return (
    <section aria-label="Neden Apuhan Çiftliği" className="mt-10 sm:mt-12">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
        {highlights.map(({ icon: Icon, label, detail }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-2 rounded-2xl border border-border/70 bg-card p-4 text-center sm:p-5"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:size-14">
              <Icon className="size-6 sm:size-7" aria-hidden />
            </span>
            <p className="text-sm font-bold text-foreground sm:text-base">{label}</p>
            <p className="text-sm leading-snug text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
