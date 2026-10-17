/**
 * Page-level <head> metadata for public storefront pages.
 *
 * A page's `openGraph` / `twitter` block REPLACES the shop layout's block
 * rather than merging with it, so a page that sets only `title` + canonical
 * still shares as the home page (og:url = "/", home title), and a page that
 * sets its own `openGraph` silently drops siteName, locale and the image
 * unless it repeats them. This builder always emits the complete set.
 *
 * Callers pass `canonical` as a literal (`canonical: "/kvkk"`): the sitemap
 * test reads page sources for exactly that string.
 */
import type { Metadata } from "next";

import { COMPANY, getLegalDoc } from "@/features/storefront/domain/legal";

export interface ShareImage {
  readonly url: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
  readonly type?: string;
}

/** The default link-preview card (logo + "Çiftlikten sofranıza", 1200×630). */
export const STOREFRONT_SHARE_IMAGE: ShareImage = {
  url: "/brand/apuhan-onizleme.jpg",
  type: "image/jpeg",
  width: 1200,
  height: 630,
  alt: "Apuhan Çiftliği logosu ve “Çiftlikten sofranıza” yazısı",
};

export interface PageMetadataInput {
  /** Bare page title; the shop layout's template adds "| Apuhan Çiftliği". */
  readonly title: string;
  readonly description: string;
  /** Site-relative path, e.g. "/urun/yumurta". */
  readonly canonical: string;
  /** Falls back to STOREFRONT_SHARE_IMAGE when null/omitted. */
  readonly image?: ShareImage | null;
  /** Article pages (recipes) also carry their publish date. */
  readonly article?: { readonly publishedTime: string };
}

export function buildPageMetadata(input: PageMetadataInput): Metadata {
  const image = input.image ?? STOREFRONT_SHARE_IMAGE;
  // og:title / twitter:title don't go through the title template.
  const socialTitle = `${input.title} | ${COMPANY.brand}`;
  const shared = {
    locale: "tr_TR",
    siteName: COMPANY.brand,
    title: socialTitle,
    description: input.description,
    url: input.canonical,
    images: [image],
  };
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: input.canonical },
    openGraph: input.article
      ? { ...shared, type: "article", publishedTime: input.article.publishedTime }
      : { ...shared, type: "website" },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: input.description,
      images: [image.url],
    },
  };
}

/** Metadata for a LEGAL_DOCS page; `canonical` must be `/<slug>`. */
export function buildLegalPageMetadata(input: {
  readonly slug: string;
  readonly canonical: string;
}): Metadata {
  const doc = getLegalDoc(input.slug);
  // Both are build-time constants: fail the build, not a request.
  if (!doc) throw new Error(`Unknown legal doc: ${input.slug}`);
  if (input.canonical !== `/${doc.slug}`) {
    throw new Error(`Canonical ${input.canonical} does not match /${doc.slug}`);
  }
  return buildPageMetadata({
    title: doc.title,
    description: doc.description,
    canonical: input.canonical,
  });
}
