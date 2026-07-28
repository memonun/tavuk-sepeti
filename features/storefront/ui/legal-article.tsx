import { notFound } from "next/navigation";

import { getLegalDoc } from "@/features/storefront/domain/legal";

/** Renders a legal document (looked up by slug) as a readable article. */
export function LegalArticle({ slug }: { slug: string }) {
  const doc = getLegalDoc(slug);
  if (!doc) notFound();

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
    </main>
  );
}
