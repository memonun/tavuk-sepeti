import Link from "next/link";
import { notFound } from "next/navigation";

import { getLegalDoc } from "@/features/storefront/domain/legal";

/** Renders a legal document (looked up by slug) as a readable article. */
export function LegalArticle({ slug }: { slug: string }) {
  const doc = getLegalDoc(slug);
  if (!doc) notFound();

  const related = (doc.relatedSlugs ?? [])
    .map((s) => getLegalDoc(s))
    .filter((d): d is NonNullable<typeof d> => d != null);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-[2rem] leading-tight sm:text-4xl">{doc.longTitle}</h1>
      <p className="mt-2 text-base text-muted-foreground">
        Son güncelleme: {doc.updated}
      </p>

      <div className="mt-8 flex flex-col gap-6">
        {doc.sections.map((section, i) => (
          <section key={section.heading ?? i} className="flex flex-col gap-2">
            {section.heading ? (
              <h2 className="font-display text-2xl leading-tight text-foreground">
                {section.heading}
              </h2>
            ) : null}
            {section.paragraphs.map((para, j) => (
              <p
                key={j}
                className="max-w-[68ch] text-lg leading-relaxed text-foreground"
              >
                {para}
              </p>
            ))}
            {section.links?.length ? (
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 text-base">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-11 items-center font-bold text-foreground underline underline-offset-4"
                    >
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      {related.length > 0 ? (
        <nav
          aria-label="İlgili hukuki metinler"
          className="mt-10 border-t border-border pt-6"
        >
          <p className="text-base font-bold text-foreground">
            İlgili hukuki metinler
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-base">
            {related.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/${d.slug}`}
                  className="inline-flex min-h-11 items-center font-bold text-foreground underline underline-offset-4"
                >
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </main>
  );
}
