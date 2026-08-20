import { LeafIcon, PackageIcon, ShieldCheckIcon, TruckIcon } from "lucide-react";

import { CARGO_FREE_SHIPPING_NOTICE } from "@/features/storefront/domain/storefront.config";

/**
 * Four glanceable facts about buying here — large icon, short bold label, one
 * short line. Deliberately not the place for the exact delivery days or the
 * cargo minimum (those are numbers that change in the admin panel and belong
 * in the dedicated, dynamic delivery-info panel further down); this strip is
 * the quick, always-true version a customer registers in a glance.
 */
const HIGHLIGHTS = [
  {
    icon: LeafIcon,
    label: "Taze Ürünler",
    detail: "Çiftlikten sofranıza.",
  },
  {
    icon: TruckIcon,
    label: "Malatya İçi Teslimat",
    detail: "Mevcut eve servis günlerinde.",
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

export function TrustHighlights() {
  return (
    <section aria-label="Neden Apuhan Çiftliği" className="mt-10 sm:mt-12">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
        {HIGHLIGHTS.map(({ icon: Icon, label, detail }) => (
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
