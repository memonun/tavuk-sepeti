import { unstable_rethrow } from "next/navigation";

import { productImageSiteUrl } from "@/features/products/application/product-image";
import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { COMPANY } from "@/features/storefront/domain/legal";
import {
  buildMerchantFeedXml,
  selectMerchantFeedItems,
} from "@/features/storefront/domain/merchant-feed";
import { productStructuredDescription } from "@/features/storefront/domain/product-structured-data";
import { fromPriceMinor } from "@/features/storefront/ui/line-pricing";
import { env } from "@/shared/env";
import { logger, newCorrelationId } from "@/shared/logger";

// Same reason as app/sitemap.ts: the catalog read goes through the
// cookie-aware Supabase client, so this can never be prerendered.
export const dynamic = "force-dynamic";

const HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  // Merchant Center fetches the feed; nobody should find it in search.
  "X-Robots-Tag": "noindex",
  // One catalog read per hour at the edge, however often it is fetched.
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
} as const;

/**
 * Never answer a catalog outage with an empty feed: Merchant Center would
 * take that as "every product was removed" and delist the shop. A 503 makes
 * it keep the previous items and try again later.
 */
function unavailable(): Response {
  return new Response("Katalog geçici olarak okunamıyor.", {
    status: 503,
    headers: { "Retry-After": "3600", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

/** GET /merchant-feed.xml: Google Merchant Center product feed. */
export async function GET(): Promise<Response> {
  const correlationId = newCorrelationId();
  try {
    const catalog = await getStorefrontCatalog();
    if (!catalog.ok) {
      logger.error({ correlationId, code: catalog.error.code }, "merchant_feed_catalog_failed");
      return unavailable();
    }
    const { items, excluded } = selectMerchantFeedItems(
      catalog.value.map((product) => ({
        key: product.key,
        display_name: product.display_name,
        web_slug: product.web_slug,
        imageUrl: productImageSiteUrl(product.image_path, env.NEXT_PUBLIC_SUPABASE_URL),
        priceMinor: fromPriceMinor(product),
        fulfillment_type: product.fulfillment_type,
        description: productStructuredDescription(product),
      })),
    );
    logger.info({ correlationId, listed: items.length, excluded }, "merchant_feed_built");
    return new Response(buildMerchantFeedXml(items, { brand: COMPANY.brand }), { headers: HEADERS });
  } catch (error: unknown) {
    unstable_rethrow(error);
    logger.error({ correlationId, err: error }, "merchant_feed_unavailable");
    return unavailable();
  }
}
