import Image from "next/image";

import type { TrustImage, TrustPage } from "../domain/trust-page.schema";
import { TrustBreadcrumb, TrustOutro, type TrustCompany } from "./trust-parts";

/**
 * /ciftligimiz opens on the farm itself, edge to edge on a phone: the hens on
 * open ground under the Malatya sky. Then each source of what the shop sells
 * (hens, cows, the orchard) gets its own photo, always on the left, with what
 * comes of it beside. It ends at the stand where those products are sold.
 */
export function FarmStory({ page, company }: { page: TrustPage; company: TrustCompany }) {
  return (
    <main className="pb-16">
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
        <TrustBreadcrumb title={page.title} />
      </div>

      <figure className="mx-auto max-w-[96rem] sm:px-6">
        <div className="relative aspect-[4/5] overflow-hidden bg-secondary sm:aspect-[16/9] sm:rounded-3xl lg:aspect-[21/9]">
          <Image
            src={page.hero.src}
            alt={page.hero.alt}
            fill
            preload
            sizes="(max-width: 1535px) 100vw, 1488px"
            // The mountains sit about a third of the way down the frame; the
            // wide crops keep them and the nearest hens.
            className="shop-farm-hero-media object-cover object-[50%_40%]"
          />
        </div>
      </figure>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <header className="mt-8 max-w-[44rem] sm:mt-12">
          <h1 className="text-[2.5rem] leading-[1.05] sm:text-6xl">{page.heading}</h1>
          {page.lead.map((paragraph, index) => (
            <p key={index} className="mt-5 max-w-[36ch] text-xl leading-relaxed sm:text-2xl">{paragraph.text}</p>
          ))}
        </header>

        <div className="mt-14 space-y-14 sm:mt-20 sm:space-y-20">
          {page.sections.map((section) => {
            const portrait = section.image ? isPortrait(section.image) : false;
            return (
              <section
                key={section.id}
                aria-labelledby={section.id}
                className="grid scroll-mt-24 items-center gap-6 md:grid-cols-12 md:gap-10"
              >
                {section.image ? (
                  <figure className={portrait ? "max-w-[24rem] md:col-span-5 md:max-w-none" : "md:col-span-7"}>
                    <Photo image={section.image} portrait={portrait} />
                  </figure>
                ) : null}
                <div className={section.image ? (portrait ? "md:col-span-7" : "md:col-span-5") : "md:col-span-8"}>
                  <h2 id={section.id} className="text-3xl leading-tight sm:text-4xl">{section.heading}</h2>
                  {section.paragraphs.map((paragraph, index) => (
                    <p key={index} className="mt-4 max-w-[36ch] text-xl leading-relaxed">{paragraph.text}</p>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <section aria-label="Aile emeği" className="mt-20 sm:mt-28">
          {page.closing.paragraphs.map((paragraph, index) => (
            <p key={index} className="max-w-[30ch] font-display text-[1.75rem] font-bold leading-[1.2] sm:text-4xl">
              {paragraph.text}
            </p>
          ))}
          {page.closing.image ? (
            <figure className="mt-8 sm:mt-10">
              <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-secondary sm:aspect-[16/9]">
                <Image
                  src={page.closing.image.src}
                  alt={page.closing.image.alt}
                  fill
                  sizes="(max-width: 1199px) 100vw, 1104px"
                  className="object-cover object-[50%_70%]"
                />
              </div>
            </figure>
          ) : null}
        </section>
      </div>

      <TrustOutro relatedLink={page.relatedLink} company={company} />
    </main>
  );
}

function isPortrait(image: TrustImage) {
  return image.height > image.width;
}

function Photo({ image, portrait }: { image: TrustImage; portrait: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-secondary ${portrait ? "aspect-[3/4]" : "aspect-[4/3]"}`}>
      <Image
        src={image.src}
        alt={image.alt}
        fill
        sizes={portrait ? "(max-width: 767px) 384px, 460px" : "(max-width: 767px) 100vw, 640px"}
        className="object-cover"
      />
    </div>
  );
}
