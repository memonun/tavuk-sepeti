import type { Metadata } from "next";

import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = {
  title: "Teslimat Koşulları",
  alternates: { canonical: "/teslimat-kosullari" },
};

export default function Page() {
  return <LegalArticle slug="teslimat-kosullari" />;
}
