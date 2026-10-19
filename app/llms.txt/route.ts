import { unstable_rethrow } from "next/navigation";

import { getRecipesNewestFirst } from "@/features/content/application/get-recipes";
import { getPublishedTrustPages } from "@/features/content/application/get-trust-pages";
import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { FAQ_PAGE_TEXT, CONTACT_PAGE } from "@/features/storefront/domain/info-pages";
import { LEGAL_DOCS } from "@/features/storefront/domain/legal";
import { buildLlmsTxt, type LlmsTxtProduct } from "@/features/storefront/domain/llms-txt";
import { productPageDescription } from "@/features/storefront/domain/product-structured-data";
import { logger, newCorrelationId } from "@/shared/logger";

// Same reason as app/sitemap.ts: the catalog read goes through the
// cookie-aware Supabase client, so this can never be prerendered.
export const dynamic = "force-dynamic";

const HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  // For assistants to read, not a page to rank.
  "X-Robots-Tag": "noindex",
  // One catalog read per hour at the edge, however often it is fetched.
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
} as const;

/** The pages that answer "who, how, when" — each with its own meta description. */
const SHOP_PAGES = [
  {
    path: "/duzenli-siparis",
    title: "Düzenli Sipariş",
    description:
      "Her hafta veya iki haftada bir aldığınız ürünleri tekrar tekrar sipariş vermeden planlayın.",
  },
  { path: `/${FAQ_PAGE_TEXT.slug}`, title: FAQ_PAGE_TEXT.title, description: FAQ_PAGE_TEXT.description },
  { path: `/${CONTACT_PAGE.slug}`, title: CONTACT_PAGE.title, description: CONTACT_PAGE.description },
  {
    path: "/siparis-sorgula",
    title: "Sipariş Sorgula",
    description: "Sipariş numaranız ve telefonunuzla siparişinizin durumunu görün.",
  },
] as const;

/** Products only when the catalog can be read; the rest of the map is static. */
async function readProducts(correlationId: string): Promise<LlmsTxtProduct[]> {
  try {
    const catalog = await getStorefrontCatalog();
    if (catalog.ok) {
      return catalog.value.map((product) => ({
        display_name: product.display_name,
        web_slug: product.web_slug,
        description: productPageDescription(product),
        fulfillment_type: product.fulfillment_type,
      }));
    }
    logger.error({ correlationId, code: catalog.error.code }, "llms_txt_catalog_failed");
  } catch (error: unknown) {
    unstable_rethrow(error);
    logger.error({ correlationId, err: error }, "llms_txt_catalog_unavailable");
  }
  return [];
}

/** GET /llms.txt: the shop's map for AI assistants (features/storefront/domain/llms-txt.ts). */
export async function GET(): Promise<Response> {
  const correlationId = newCorrelationId();
  const products = await readProducts(correlationId);
  const body = buildLlmsTxt({
    products,
    pages: [
      ...getPublishedTrustPages().map((page) => ({
        path: `/${page.slug}`,
        title: page.title,
        description: page.description.text,
      })),
      ...SHOP_PAGES,
    ],
    recipes: getRecipesNewestFirst().map((recipe) => ({
      path: `/tarifler/${recipe.slug}`,
      title: recipe.title,
      description: recipe.description,
    })),
    legal: LEGAL_DOCS.map((doc) => ({ path: `/${doc.slug}`, title: doc.title, description: doc.description })),
  });
  // A catalog outage still answers with the rest of the map, but briefly, so
  // the edge does not keep a product-less copy for an hour.
  return new Response(body, {
    headers: products.length > 0 ? HEADERS : { ...HEADERS, "Cache-Control": "no-store" },
  });
}
