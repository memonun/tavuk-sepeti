import type { MetadataRoute } from "next";
import { randomUUID } from "node:crypto";

import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { buildStorefrontSitemapEntries } from "@/features/storefront/domain/sitemap-entries";
import { logger } from "@/shared/logger";

/** Keep the static URLs available even during a catalog outage. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const correlationId = randomUUID();
  try {
    const catalog = await getStorefrontCatalog();
    if (catalog.ok) return buildStorefrontSitemapEntries(catalog.value);
    logger.error(
      { correlationId, code: catalog.error.code },
      "sitemap_catalog_failed",
    );
  } catch (error: unknown) {
    logger.error({ correlationId, err: error }, "sitemap_catalog_unavailable");
  }
  return buildStorefrontSitemapEntries();
}
