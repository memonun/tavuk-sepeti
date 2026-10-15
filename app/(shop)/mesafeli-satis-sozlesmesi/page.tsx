import type { Metadata } from "next";

import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = {
  title: "Mesafeli Satış Sözleşmesi",
  alternates: { canonical: "/mesafeli-satis-sozlesmesi" },
};

export default function Page() {
  return <LegalArticle slug="mesafeli-satis-sozlesmesi" />;
}
