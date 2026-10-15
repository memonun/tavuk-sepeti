import Link from "next/link";

import type { TrustPage } from "../domain/trust-page.schema";

export interface TrustCompany {
  readonly ownerName: string;
  readonly brand: string;
  readonly address: string;
  readonly phone: string;
  readonly email: string;
}

export function TrustBreadcrumb({ title }: { title: string }) {
  return (
    <nav aria-label="İçerik yolu" className="mb-6 flex flex-wrap items-center gap-2 text-base text-muted-foreground">
      <Link href="/" className="shop-focus inline-flex min-h-11 items-center rounded underline underline-offset-4">
        Ana sayfa
      </Link>
      <span aria-hidden>/</span>
      <span aria-current="page">{title}</span>
    </nav>
  );
}

/**
 * The end of both pages: where to go next, then how to reach the farm, set on
 * the farm's own chalkboard (the stand's sign carries the same phone number).
 */
export function TrustOutro({ relatedLink, company }: { relatedLink: TrustPage["relatedLink"]; company: TrustCompany }) {
  return (
    <div className="mx-auto mt-16 max-w-6xl px-4 sm:mt-20 sm:px-6">
      <nav aria-label="Çiftliği keşfedin" className="flex flex-wrap gap-3">
        <Link href="/#urunler" data-variant="primary" data-size="lg" className="shop-btn shop-press shop-focus">
          Ürünleri inceleyin
        </Link>
        <Link href={relatedLink.href} data-variant="secondary" data-size="lg" className="shop-btn shop-press shop-focus">
          {relatedLink.label}
        </Link>
      </nav>

      <section
        aria-labelledby="ciftlik-iletisim"
        className="mt-10 rounded-3xl bg-(--shop-chalkboard) px-6 py-8 text-(--shop-chalk) sm:px-10 sm:py-12"
      >
        <h2 id="ciftlik-iletisim" className="text-3xl leading-tight sm:text-4xl">Bize ulaşın</h2>
        <address className="mt-5 space-y-3 text-lg leading-relaxed not-italic sm:text-xl">
          <p>{company.address}</p>
          <p>
            <a href={`tel:${company.phone.replaceAll(" ", "")}`} className={chalkLinkClass}>
              <span className="font-display text-2xl font-bold sm:text-3xl">{company.phone}</span>
            </a>
          </p>
          <p>
            <a href={`mailto:${company.email}`} className={`${chalkLinkClass} break-all`}>{company.email}</a>
          </p>
        </address>
      </section>
    </div>
  );
}

const chalkLinkClass =
  "inline-flex min-h-11 items-center rounded underline decoration-2 underline-offset-[6px] outline-(--shop-chalk) focus-visible:outline-3 focus-visible:outline-offset-4";
