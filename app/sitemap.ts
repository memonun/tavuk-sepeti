import type { MetadataRoute } from "next";
import { unstable_rethrow } from "next/navigation";
import { randomUUID } from "node:crypto";

import { getRecipesNewestFirst } from "@/features/content/application/get-recipes";
import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import {
  buildStorefrontSitemapEntries,
  type StorefrontSitemapEntry,
} from "@/features/storefront/domain/sitemap-entries";
import { logger } from "@/shared/logger";

// The catalog read goes through the cookie-aware Supabase client, so this
// route can never be prerendered. Saying so up front stops the build from
// trying (and from logging a bogus "catalog unavailable" when it bails out),
// and guarantees product URLs are always read fresh per request.
export const dynamic = "force-dynamic";

function toSitemap(entries: StorefrontSitemapEntry[]): MetadataRoute.Sitemap {
  return entries.map((entry) => ({
    url: entry.url,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
    ...(entry.lastModified ? { lastModified: entry.lastModified } : {}),
  }));
}

/** Keep the static URLs available even during a catalog outage. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const correlationId = randomUUID();
  const recipes = getRecipesNewestFirst();
  try {
    const catalog = await getStorefrontCatalog();
    if (catalog.ok) return toSitemap(buildStorefrontSitemapEntries(catalog.value, recipes));
    logger.error(
      { correlationId, code: catalog.error.code },
      "sitemap_catalog_failed",
    );
  } catch (error: unknown) {
    // Next's own control-flow errors (dynamic bail-out, redirects) must pass.
    unstable_rethrow(error);
    logger.error({ correlationId, err: error }, "sitemap_catalog_unavailable");
  }
  return toSitemap(buildStorefrontSitemapEntries([], recipes));
}
