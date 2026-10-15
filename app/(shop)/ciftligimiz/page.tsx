import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getTrustPage } from "@/features/content/application/get-trust-pages";
import { FarmStory } from "@/features/content/ui/farm-story";
import { COMPANY } from "@/features/storefront/domain/legal";

// 404 while the trust pages are unpublished (see trust-pages-visibility.ts).
function resolvePage() {
  const page = getTrustPage("ciftligimiz");
  if (!page) notFound();
  return page;
}

export function generateMetadata(): Metadata {
  const page = resolvePage();
  return {
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
}

export default function FarmPage() {
  const page = resolvePage();
  return <FarmStory page={page} company={COMPANY} />;
}
