import type { Metadata } from "next";

import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = {
  title: "Kullanım Şartları",
  description:
    "Apuhan Çiftliği internet sitesinin kullanım esasları, sipariş süreçleri, ürün ve teslimat bilgileri ile kullanıcı sorumluluklarına ilişkin kullanım şartları.",
};

export default function Page() {
  return <LegalArticle slug="kullanim-sartlari" />;
}
