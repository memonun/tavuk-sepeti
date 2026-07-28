import type { Metadata } from "next";

import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = { title: "İptal ve İade Koşulları" };

export default function Page() {
  return <LegalArticle slug="iptal-iade-kosullari" />;
}
