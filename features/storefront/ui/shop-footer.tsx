import Link from "next/link";

import { COMPANY, LEGAL_LINKS } from "@/features/storefront/domain/legal";

/** Storefront footer: brand + company identity, legal links, payment/ETBİS —
 *  the compliance surface a Turkish payment provider requires. */
export function ShopFooter() {
  return (
    <footer className="border-t border-border bg-muted">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-display text-2xl text-foreground">{COMPANY.brand}</p>
            <p className="mt-2 text-base text-muted-foreground">
              Çiftlikten sofranıza, kapınıza teslim.
            </p>
            <address className="mt-4 space-y-1 text-base leading-relaxed text-muted-foreground not-italic">
              <p>{COMPANY.tradeName}</p>
              <p>{COMPANY.address}</p>
              <p>{COMPANY.phone}</p>
              <p className="break-all">{COMPANY.email}</p>
              {COMPANY.mersisNo ? <p>MERSİS: {COMPANY.mersisNo}</p> : null}
            </address>
          </div>

          <nav aria-label="Yasal" className="flex flex-col">
            <p className="mb-1 text-lg font-bold text-foreground">Yasal</p>
            {LEGAL_LINKS.map((l) => (
              <Link key={l.slug} href={`/${l.slug}`} className={footerLinkClass}>
                {l.title}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col">
            <p className="mb-1 text-lg font-bold text-foreground">Güvenli Ödeme</p>
            <p className="py-1.5 text-base text-muted-foreground">
              Kredi ve banka kartıyla 3D Secure güvenli ödeme (PayTR altyapısı).
            </p>
            <p className="py-1.5 text-base text-muted-foreground">
              Visa, Mastercard, Troy
            </p>
            <a
              href={COMPANY.etbisUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={footerLinkClass}
            >
              ETBİS Kayıtlı Elektronik Ticaret
            </a>
          </div>
        </div>

        <p className="mt-8 border-t border-border pt-5 text-base text-muted-foreground">
          © 2026 {COMPANY.brand}. Tüm hakları saklıdır.
        </p>
      </div>
    </footer>
  );
}

/* Underlined at rest: a link that only shows itself on hover is invisible on
   a phone. 44px tall so two adjacent links are not a coin-toss to tap. */
const footerLinkClass =
  "shop-focus flex min-h-11 items-center rounded-md text-base text-foreground underline decoration-border decoration-2 underline-offset-4";
