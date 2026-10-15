import { TRUST_CONTENT } from "../domain/trust-pages";
import { TRUST_PAGES_PUBLISHED } from "../domain/trust-pages-visibility";

export type { TrustImage, TrustPage } from "../domain/trust-page.schema";
export { buildAboutPageStructuredData } from "../domain/about-page-structured-data";
export { TRUST_PAGES_PUBLISHED } from "../domain/trust-pages-visibility";

/** Null for every slug while the pages are unpublished, so routes 404. */
export function getTrustPage(slug: string, published = TRUST_PAGES_PUBLISHED) {
  if (!published) return null;
  return TRUST_CONTENT.pages.find((page) => page.slug === slug) ?? null;
}

/** The pages that may be linked and listed in the sitemap right now. */
export function getPublishedTrustPages(published = TRUST_PAGES_PUBLISHED) {
  return published ? TRUST_CONTENT.pages : [];
}
