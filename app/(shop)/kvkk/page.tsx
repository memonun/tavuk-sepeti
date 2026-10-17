import type { Metadata } from "next";

import { buildLegalPageMetadata } from "@/features/storefront/application/page-metadata";
import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = buildLegalPageMetadata({
  slug: "kvkk",
  canonical: "/kvkk",
});

export default function Page() {
  return <LegalArticle slug="kvkk" />;
}
