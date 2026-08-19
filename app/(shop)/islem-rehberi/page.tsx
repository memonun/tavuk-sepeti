import type { Metadata } from "next";

import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = {
  title: "İşlem Rehberi",
  description:
    "Apuhan Çiftliği'nde sipariş oluşturma, sözleşmeler, sipariş sonrası erişim ve kişisel veriler hakkında işlem rehberi.",
};

export default function Page() {
  return <LegalArticle slug="islem-rehberi" />;
}
