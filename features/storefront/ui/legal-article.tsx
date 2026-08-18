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
      <h1 className="font-display text-3xl">{doc.longTitle}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Son güncelleme: {doc.updated}
      </p>

      <div className="mt-8 flex flex-col gap-6">
        {doc.sections.map((section, i) => (
          <section key={section.heading ?? i} className="flex flex-col gap-2">
            {section.heading ? (
              <h2 className="font-display text-lg text-foreground">
                {section.heading}
              </h2>
            ) : null}
            {section.paragraphs.map((para, j) => (
              <p
                key={j}
                className="text-sm leading-relaxed text-muted-foreground"
              >
                {para}
              </p>
            ))}
          </section>
        ))}
      </div>

      {related.length > 0 ? (
        <nav
          aria-label="İlgili hukuki metinler"
          className="mt-10 border-t border-border/60 pt-6"
        >
          <p className="text-sm font-medium text-foreground">
            İlgili hukuki metinler
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {related.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/${d.slug}`}
                  className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
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
