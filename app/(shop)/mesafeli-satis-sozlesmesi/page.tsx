import type { Metadata } from "next";

import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = { title: "Mesafeli Satış Sözleşmesi" };

export default function Page() {
  return <LegalArticle slug="mesafeli-satis-sozlesmesi" />;
}
