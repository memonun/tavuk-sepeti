import type { Metadata } from "next";

import { buildLegalPageMetadata } from "@/features/storefront/application/page-metadata";
import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = buildLegalPageMetadata({
  slug: "cerez-politikasi",
  canonical: "/cerez-politikasi",
});

export default function Page() {
  return <LegalArticle slug="cerez-politikasi" />;
}
