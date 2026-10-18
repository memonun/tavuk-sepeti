/**
 * JSON-LD for /iletisim (ContactPage) and /sss (FAQPage), each with the
 * BreadcrumbList that mirrors the visible "Ana sayfa / {title}" breadcrumb.
 *
 * Both point at the organization the storefront layout already emits, by
 * @id, instead of repeating its name/address/phone: one source of truth for
 * the business identity (and no second, possibly diverging, LocalBusiness).
 *
 * Pure: no I/O, no env.
 */
import { publishedFaqItems, type ContactPage, type FaqPage } from "@/features/storefront/domain/info-page.schema";
import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";

type InfoPageHead = { readonly slug: string; readonly title: string; readonly description: string };

function pageIds(slug: string) {
  const url = `${CANONICAL_ORIGIN}/${slug}`;
  return { url, webPageId: `${url}#webpage`, breadcrumbId: `${url}#breadcrumb` };
}

function breadcrumbList(page: InfoPageHead) {
  const { url, breadcrumbId } = pageIds(page.slug);
  return {
    "@type": "BreadcrumbList",
    "@id": breadcrumbId,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Ana sayfa", item: CANONICAL_ORIGIN },
      { "@type": "ListItem", position: 2, name: page.title, item: url },
    ],
  } as const;
}

const organizationRef = { "@id": `${CANONICAL_ORIGIN}/#organization` } as const;

export function buildContactPageStructuredData(page: Pick<ContactPage, "slug" | "title" | "description">) {
  const { url, webPageId, breadcrumbId } = pageIds(page.slug);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ContactPage",
        "@id": webPageId,
        url,
        name: page.title,
        description: page.description,
        inLanguage: "tr-TR",
        breadcrumb: { "@id": breadcrumbId },
        about: organizationRef,
        mainEntity: organizationRef,
      },
      breadcrumbList(page),
    ],
  } as const;
}

/**
 * Only the rendered (published) questions, with the answer text exactly as
 * shown: the paragraphs in order, joined by a space. Follow-up links are
 * navigation, not part of the answer, and are left out.
 */
export function buildFaqPageStructuredData(page: Pick<FaqPage, "slug" | "title" | "description" | "items">) {
  const { url, webPageId, breadcrumbId } = pageIds(page.slug);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "@id": webPageId,
        url,
        name: page.title,
        description: page.description,
        inLanguage: "tr-TR",
        breadcrumb: { "@id": breadcrumbId },
        about: organizationRef,
        mainEntity: publishedFaqItems(page).map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer.join(" ") },
        })),
      },
      breadcrumbList(page),
    ],
  } as const;
}
