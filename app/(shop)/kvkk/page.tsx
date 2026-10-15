import type { Metadata } from "next";

import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = {
  title: "KVKK Aydınlatma Metni",
  alternates: { canonical: "/kvkk" },
};

export default function Page() {
  return <LegalArticle slug="kvkk" />;
}
