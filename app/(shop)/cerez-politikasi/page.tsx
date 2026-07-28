import type { Metadata } from "next";

import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = { title: "Çerez Politikası" };

export default function Page() {
  return <LegalArticle slug="cerez-politikasi" />;
}
