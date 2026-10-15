import type { Metadata } from "next";

import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = {
  title: "Düzenli Sipariş Koşulları",
  alternates: { canonical: "/duzenli-siparis-kosullari" },
};

export default function RecurringOrderTermsPage() {
  return <LegalArticle slug="duzenli-siparis-kosullari" />;
}
