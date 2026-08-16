import Link from "next/link";

import { COMPANY, LEGAL_LINKS } from "@/features/storefront/domain/legal";

/** Storefront footer: brand + company identity, legal links, payment/ETBİS —
 *  the compliance surface a Turkish payment provider requires. */
export function ShopFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <p className="font-display text-base text-foreground">
              {COMPANY.brand}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Taze yumurta ve süt ürünleri · kapınıza teslim.
            </p>
            <div className="mt-3 space-y-0.5 text-xs leading-relaxed text-muted-foreground">
              <p>{COMPANY.tradeName}</p>
              <p>{COMPANY.address}</p>
              <p>
                {COMPANY.phone} · {COMPANY.email}
              </p>
              {COMPANY.mersisNo ? <p>MERSİS: {COMPANY.mersisNo}</p> : null}
            </div>
          </div>

          <nav aria-label="Yasal" className="flex flex-col gap-1.5 text-sm">
            <p className="mb-1 font-medium text-foreground">Yasal</p>
            {LEGAL_LINKS.map((l) => (
              <Link
                key={l.slug}
                href={`/${l.slug}`}
                className="text-muted-foreground transition-colors hover:text-foreground hover:underline"
              >
                {l.title}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col gap-2 text-sm">
            <p className="font-medium text-foreground">Güvenli Ödeme</p>
            <p className="text-xs text-muted-foreground">
              Kredi/banka kartı ile 3D Secure güvenli ödeme — PayTR altyapısı.
            </p>
            <p className="text-xs text-muted-foreground">
              Visa · Mastercard · Troy
            </p>
            <a
              href={COMPANY.etbisUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              ETBİS Kayıtlı Elektronik Ticaret
            </a>
          </div>
        </div>

        <div className="mt-8 border-t border-border/60 pt-4 text-xs text-muted-foreground">
          © 2026 {COMPANY.brand}. Tüm hakları saklıdır.
        </div>
      </div>
    </footer>
  );
}
