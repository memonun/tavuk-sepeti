import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { buildAboutPageStructuredData, getTrustPage } from "@/features/content/application/get-trust-pages";
import { AboutLetter } from "@/features/content/ui/about-letter";
import { buildPageMetadata } from "@/features/storefront/application/page-metadata";
import { COMPANY } from "@/features/storefront/domain/legal";

// 404 while the trust pages are unpublished (see trust-pages-visibility.ts).
function resolvePage() {
  const page = getTrustPage("hakkimizda");
  if (!page) notFound();
  return page;
}

export function generateMetadata(): Metadata {
  const page = resolvePage();
  return buildPageMetadata({
    title: page.title,
    description: page.description.text,
    canonical: "/hakkimizda",
    // A 1200×630 JPEG crop of the hero: the hero .webp itself is too large
    // (and the wrong shape) for WhatsApp/Facebook link previews.
    image: { url: "/brand/og-hakkimizda.jpg", type: "image/jpeg", width: 1200, height: 630, alt: page.hero.alt },
  });
}

export default function AboutPage() {
  const page = resolvePage();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{
        __html: JSON.stringify(buildAboutPageStructuredData(page)).replace(/</g, "\\u003c"),
      }} />
      <AboutLetter page={page} company={COMPANY} />
    </>
  );
}
