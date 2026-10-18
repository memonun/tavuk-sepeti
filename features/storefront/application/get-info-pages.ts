import "server-only";

import { getStorefrontSettings } from "@/features/storefront/application/get-storefront-settings";
import { buildFaqPage } from "@/features/storefront/domain/info-pages";

export type { ContactPage, FaqPage, PublishedFaqItem } from "@/features/storefront/domain/info-page.schema";
export { publishedFaqItems } from "@/features/storefront/domain/info-page.schema";
export { CONTACT_PAGE, FAQ_PAGE_TEXT } from "@/features/storefront/domain/info-pages";
export {
  buildContactPageStructuredData,
  buildFaqPageStructuredData,
} from "@/features/storefront/domain/info-page-structured-data";

/**
 * /sss with today's delivery days, fees and order floors. Reads the same
 * cached settings the shop layout already loaded for this request, so the
 * page adds no query; a settings outage degrades to the launch defaults.
 */
export async function getFaqPage() {
  return buildFaqPage(await getStorefrontSettings());
}
