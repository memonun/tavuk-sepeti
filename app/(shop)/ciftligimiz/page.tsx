import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getTrustPage } from "@/features/content/application/get-trust-pages";
import { TrustArticle } from "@/features/content/ui/trust-article";
import { COMPANY } from "@/features/storefront/domain/legal";

const page = getTrustPage("ciftligimiz") ?? notFound();

export const metadata: Metadata = {
  title: page.title,
  description: page.description.text,
  alternates: { canonical: "/ciftligimiz" },
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: COMPANY.brand,
    title: `${page.title} | ${COMPANY.brand}`,
    description: page.description.text,
    url: "/ciftligimiz",
    images: [{ url: page.hero.src, alt: page.hero.alt, width: page.hero.width, height: page.hero.height }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${page.title} | ${COMPANY.brand}`,
    description: page.description.text,
    images: [page.hero.src],
  },
};

export default function FarmPage() {
  return <TrustArticle page={page} company={COMPANY} />;
}
