import type { Metadata } from "next";

import { TrustBreadcrumb } from "@/features/content/ui/trust-parts";
import { buildPageMetadata } from "@/features/storefront/application/page-metadata";
import {
  buildFaqPageStructuredData,
  FAQ_PAGE_TEXT,
  getFaqPage,
} from "@/features/storefront/application/get-info-pages";
import { FaqList } from "@/features/storefront/ui/faq-list";

export const metadata: Metadata = buildPageMetadata({
  title: FAQ_PAGE_TEXT.title,
  // No amounts here: fees and minimums are store settings, the answers read them live.
  description: FAQ_PAGE_TEXT.description,
  canonical: "/sss",
});

export default async function FaqPage() {
  const page = await getFaqPage();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{
        __html: JSON.stringify(buildFaqPageStructuredData(page)).replace(/</g, "\\u003c"),
      }} />
      <TrustBreadcrumb title={page.title} />
      <FaqList page={page} />
    </main>
  );
}
