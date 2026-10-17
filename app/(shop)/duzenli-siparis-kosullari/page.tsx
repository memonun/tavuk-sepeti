import type { Metadata } from "next";

import { buildLegalPageMetadata } from "@/features/storefront/application/page-metadata";
import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = buildLegalPageMetadata({
  slug: "duzenli-siparis-kosullari",
  canonical: "/duzenli-siparis-kosullari",
});

export default function RecurringOrderTermsPage() {
  return <LegalArticle slug="duzenli-siparis-kosullari" />;
}
