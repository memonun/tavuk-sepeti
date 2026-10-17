import type { Metadata } from "next";

import { buildLegalPageMetadata } from "@/features/storefront/application/page-metadata";
import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = buildLegalPageMetadata({
  slug: "on-bilgilendirme-formu",
  canonical: "/on-bilgilendirme-formu",
});

export default function Page() {
  return <LegalArticle slug="on-bilgilendirme-formu" />;
}
