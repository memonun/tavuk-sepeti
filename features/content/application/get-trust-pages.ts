import { TRUST_CONTENT } from "../domain/trust-pages";

export type { TrustImage, TrustPage } from "../domain/trust-page.schema";
export { buildAboutPageStructuredData } from "../domain/about-page-structured-data";

export function getTrustPage(slug: string) {
  return TRUST_CONTENT.pages.find((page) => page.slug === slug) ?? null;
}
