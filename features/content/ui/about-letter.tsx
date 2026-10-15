import Image from "next/image";

import type { TrustImage, TrustPage } from "../domain/trust-page.schema";
import { TrustBreadcrumb, TrustOutro, type TrustCompany } from "./trust-parts";

/**
 * /hakkimizda is the owner's own letter, so it is set as one: a single
 * reading column, his opening a step larger, his headings as written, and his
 * sign-off and name at the end. His photo stays beside the letter while it is
 * read on wide screens; on a phone it opens the page.
 */
export function AboutLetter({ page, company }: { page: TrustPage; company: TrustCompany }) {
  const [opening, ...lead] = page.lead;
  return (
    <main className="pb-16">
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
        <TrustBreadcrumb title={page.title} />

        <article className="grid gap-8 md:grid-cols-[minmax(0,1fr)_17rem] md:gap-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-20">
          <div className="max-w-[40rem] md:col-start-1 md:row-start-1">
            <h1 className="text-[2.75rem] leading-[1.05] sm:text-6xl">{page.heading}</h1>
          </div>

          <figure className="w-full max-w-[19rem] md:sticky md:top-28 md:col-start-2 md:row-span-2 md:row-start-1 md:max-w-none md:self-start">
            <Portrait image={page.hero} preload />
          </figure>

          <div className="max-w-[40rem] md:col-start-1 md:row-start-2">
            {opening ? (
              <p className="text-[1.375rem] leading-[1.55] sm:text-2xl sm:leading-[1.5]">{opening.text}</p>
            ) : null}
            {lead.map((paragraph, index) => (
              <p key={index} className={bodyClass}>{paragraph.text}</p>
            ))}

            {page.sections.map((section) => (
              <section key={section.id} aria-labelledby={section.id} className="scroll-mt-24">
                <h2 id={section.id} className="mt-14 text-[1.75rem] leading-tight sm:text-3xl">{section.heading}</h2>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className={bodyClass}>{paragraph.text}</p>
                ))}
                {section.image ? (
                  <figure className="mt-8 max-w-[26rem]">
                    <Portrait image={section.image} />
                  </figure>
                ) : null}
              </section>
            ))}

            <div className="mt-14">
              {page.closing.paragraphs.map((paragraph, index) => (
                <p key={index} className={bodyClass}>{paragraph.text}</p>
              ))}
              {page.closing.signOff ? <p className="mt-10 text-xl">{page.closing.signOff}</p> : null}
              <p className="mt-3 font-display text-3xl leading-tight">{company.ownerName}</p>
              <p className="mt-1 text-lg text-muted-foreground">{company.brand}</p>
            </div>
          </div>
        </article>
      </div>

      <TrustOutro relatedLink={page.relatedLink} company={company} />
    </main>
  );
}

const bodyClass = "mt-6 text-xl leading-[1.7]";

function Portrait({ image, preload = false }: { image: TrustImage; preload?: boolean }) {
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-3xl bg-secondary">
      <Image
        src={image.src}
        alt={image.alt}
        fill
        preload={preload}
        sizes="(max-width: 767px) 416px, 320px"
        className="object-cover"
      />
    </div>
  );
}
