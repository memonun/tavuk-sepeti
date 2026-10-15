import Image from "next/image";
import Link from "next/link";

import type { TrustImage, TrustPage } from "../domain/trust-page.schema";

interface TrustArticleProps {
  page: TrustPage;
  company: {
    readonly ownerName: string;
    readonly address: string;
    readonly phone: string;
    readonly email: string;
  };
}

/** Source references stay in the content module; the article reads as a story. */
export function TrustArticle({ page, company }: TrustArticleProps) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <nav aria-label="İçerik yolu" className="mb-6 flex flex-wrap items-center gap-2 text-base text-muted-foreground">
        <Link href="/" className="shop-focus inline-flex min-h-11 items-center rounded underline underline-offset-4">
          Ana sayfa
        </Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{page.title}</span>
      </nav>

      <article>
        <header className="grid items-center gap-8 md:grid-cols-2 lg:gap-12">
          <div>
            <p className="text-base font-semibold text-primary">{page.eyebrow}</p>
            <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">{page.title}</h1>
            <p className="mt-5 max-w-[38ch] text-xl leading-relaxed text-foreground">
              {page.introduction.text}
            </p>
            <p className="mt-5 text-base font-semibold text-muted-foreground">{company.ownerName}</p>
          </div>
          <TrustFigure image={page.hero} hero />
        </header>

        <div className="mx-auto mt-12 max-w-3xl space-y-10 sm:mt-16 sm:space-y-14">
          {page.sections.map((section) => (
            <section key={section.id} aria-labelledby={section.id} className="scroll-mt-24">
              <h2 id={section.id} className="font-display text-3xl leading-tight">{section.heading}</h2>
              <div className="mt-4 space-y-4">
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="max-w-[68ch] text-lg leading-relaxed text-foreground">
                    {paragraph.text}
                  </p>
                ))}
              </div>
              {section.image ? <div className="mt-6"><TrustFigure image={section.image} /></div> : null}
            </section>
          ))}
        </div>
      </article>

      <div className="mx-auto mt-12 max-w-3xl border-t border-border pt-8 sm:mt-16">
        <nav aria-label="Çiftliği keşfedin" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href={page.relatedLink.href} className={linkClass}>{page.relatedLink.label}<span aria-hidden> →</span></Link>
          <Link href="/#urunler" className={linkClass}>Ürünleri inceleyin<span aria-hidden> →</span></Link>
        </nav>
        <section aria-labelledby="ciftlik-iletisim" className="mt-8 border-t border-border pt-8">
          <h2 id="ciftlik-iletisim" className="font-display text-2xl">Bize ulaşın</h2>
          <address className="mt-3 space-y-2 text-lg leading-relaxed not-italic">
            <p>{company.ownerName}</p>
            <p>{company.address}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <a href={`tel:${company.phone.replaceAll(" ", "")}`} className={linkClass}>{company.phone}</a>
              <a href={`mailto:${company.email}`} className={`${linkClass} break-all`}>{company.email}</a>
            </div>
          </address>
        </section>
      </div>
    </main>
  );
}

function TrustFigure({ image, hero = false }: { image: TrustImage; hero?: boolean }) {
  return (
    <figure>
      <div className={`relative overflow-hidden rounded-3xl bg-muted ${hero ? "aspect-square" : "aspect-[4/3]"}`}>
        <Image
          src={image.src}
          alt={image.alt}
          fill
          preload={hero}
          sizes={hero ? "(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 552px" : "(max-width: 767px) 100vw, 768px"}
          className="object-cover"
        />
      </div>
      <figcaption className="mt-3 text-base leading-relaxed text-muted-foreground">{image.caption}</figcaption>
    </figure>
  );
}

const linkClass = "shop-focus inline-flex min-h-11 items-center gap-1 rounded text-base font-semibold text-primary underline underline-offset-4";
