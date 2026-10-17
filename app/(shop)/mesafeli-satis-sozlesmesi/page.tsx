import type { Metadata } from "next";

import { buildLegalPageMetadata } from "@/features/storefront/application/page-metadata";
import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = buildLegalPageMetadata({
  slug: "mesafeli-satis-sozlesmesi",
  canonical: "/mesafeli-satis-sozlesmesi",
});

export default function Page() {
  return <LegalArticle slug="mesafeli-satis-sozlesmesi" />;
}
