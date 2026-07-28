import type { Metadata } from "next";

import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = { title: "Gizlilik Politikası" };

export default function Page() {
  return <LegalArticle slug="gizlilik-politikasi" />;
}
