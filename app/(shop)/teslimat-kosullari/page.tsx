import type { Metadata } from "next";

import { buildLegalPageMetadata } from "@/features/storefront/application/page-metadata";
import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = buildLegalPageMetadata({
  slug: "teslimat-kosullari",
  canonical: "/teslimat-kosullari",
});

export default function Page() {
  return <LegalArticle slug="teslimat-kosullari" />;
}
