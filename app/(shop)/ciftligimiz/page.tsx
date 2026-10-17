import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getTrustPage } from "@/features/content/application/get-trust-pages";
import { FarmStory } from "@/features/content/ui/farm-story";
import { buildPageMetadata } from "@/features/storefront/application/page-metadata";
import { COMPANY } from "@/features/storefront/domain/legal";

// 404 while the trust pages are unpublished (see trust-pages-visibility.ts).
function resolvePage() {
  const page = getTrustPage("ciftligimiz");
  if (!page) notFound();
  return page;
}

export function generateMetadata(): Metadata {
  const page = resolvePage();
  return buildPageMetadata({
    title: page.title,
    description: page.description.text,
    canonical: "/ciftligimiz",
    // A 1200×630 JPEG crop of the hero: the hero .webp itself is too large
    // (and the wrong shape) for WhatsApp/Facebook link previews.
    image: { url: "/brand/og-ciftligimiz.jpg", type: "image/jpeg", width: 1200, height: 630, alt: page.hero.alt },
  });
}

export default function FarmPage() {
  const page = resolvePage();
  return <FarmStory page={page} company={COMPANY} />;
}
