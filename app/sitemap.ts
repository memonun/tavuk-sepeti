import type { MetadataRoute } from "next";

import { buildStorefrontSitemapEntries } from "@/features/storefront/domain/sitemap-entries";

/** /sitemap.xml — the indexable storefront pages. Static: no DB access. */
export default function sitemap(): MetadataRoute.Sitemap {
  return buildStorefrontSitemapEntries().map((entry) => ({
    url: entry.url,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
    ...(entry.lastModified ? { lastModified: entry.lastModified } : {}),
  }));
}
