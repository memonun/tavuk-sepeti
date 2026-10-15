/**
 * The storefront pages listed in /sitemap.xml (rendered by app/sitemap.ts).
 *
 * Only pages a search engine should index belong here: the shop, the public
 * info pages and every legal/guide text. Account, checkout and auth pages are
 * deliberately absent — they carry `noindex` (see their page metadata).
 *
 * Every path listed here must also declare the same path as its canonical URL
 * (`alternates.canonical`); sitemap-entries.test.ts enforces that, so a page
 * added here cannot silently canonicalise somewhere else.
 *
 * Pure: no env, no I/O, no Next types.
 */
import { LEGAL_DOCS } from "@/features/storefront/domain/legal";
import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";

export interface StorefrontSitemapEntry {
  /** Site-relative path, e.g. "/kvkk". */
  readonly path: string;
  /** Absolute URL on the canonical origin. */
  readonly url: string;
  /** YYYY-MM-DD, for versioned legal texts and published recipes. */
  readonly lastModified?: string;
  readonly changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  readonly priority: number;
}

function entry(
  path: string,
  changeFrequency: StorefrontSitemapEntry["changeFrequency"],
  priority: number,
  lastModified?: string,
): StorefrontSitemapEntry {
  return {
    path,
    url: path === "/" ? CANONICAL_ORIGIN : `${CANONICAL_ORIGIN}${path}`,
    changeFrequency,
    priority,
    ...(lastModified ? { lastModified } : {}),
  };
}

/** Products are supplied by the filtered storefront catalog. */
export function buildStorefrontSitemapEntries(
  products: readonly { readonly web_slug: string | null }[] = [],
  recipes: readonly { readonly slug: string; readonly publishedAt: string }[] = [],
): StorefrontSitemapEntry[] {
  return [
    // The shop itself: prices and stock change daily.
    entry("/", "daily", 1),
    entry("/tarifler", "weekly", 0.7),
    entry("/duzenli-siparis", "monthly", 0.6),
    entry("/siparis-sorgula", "yearly", 0.3),
    ...LEGAL_DOCS.map((doc) => entry(`/${doc.slug}`, "yearly", 0.2, doc.updated)),
    ...[...new Set(products.flatMap((product) => product.web_slug ? [product.web_slug] : []))]
      .map((slug) => entry(`/urun/${slug}`, "daily", 0.8)),
    ...recipes.map((recipe) => entry(`/tarifler/${recipe.slug}`, "monthly", 0.7, recipe.publishedAt)),
  ];
}
