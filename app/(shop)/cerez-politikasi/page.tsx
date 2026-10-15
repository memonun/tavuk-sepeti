import type { Metadata } from "next";

import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = {
  title: "Çerez Politikası",
  alternates: { canonical: "/cerez-politikasi" },
};

export default function Page() {
  return <LegalArticle slug="cerez-politikasi" />;
}
