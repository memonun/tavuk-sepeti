import type { Metadata } from "next";

import { LegalArticle } from "@/features/storefront/ui/legal-article";

export const metadata: Metadata = {
  title: "Gizlilik Politikası",
  description:
    "Apuhan Çiftliği'nin kişisel verilerin işlenmesi, sipariş, ödeme, teslimat, çerezler ve KVKK kapsamındaki kullanıcı haklarına ilişkin bilgilendirme metni.",
};

export default function Page() {
  return <LegalArticle slug="gizlilik-politikasi" />;
}
