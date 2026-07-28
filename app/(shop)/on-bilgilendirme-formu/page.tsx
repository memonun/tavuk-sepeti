import type { Metadata } from "next";

import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = { title: "Ön Bilgilendirme Formu" };

export default function Page() {
  return <LegalArticle slug="on-bilgilendirme-formu" />;
}
