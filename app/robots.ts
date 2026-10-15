import type { MetadataRoute } from "next";

import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";
import { ADMIN_ROUTE_PREFIXES } from "@/shared/routes/admin-route-prefixes";

/**
 * /robots.txt.
 *
 * Disallows only what a crawler has no business fetching at all: the API, the
 * auth/OAuth plumbing, the admin sign-in and the admin panel. Customer account
 * and checkout pages (/giris, /kayit, /hesap, /odeme, …) are NOT disallowed on
 * purpose: they carry a `noindex` meta tag, and Google can only see that tag
 * if it is allowed to crawl the page — a disallowed URL can still be indexed
 * as a bare link.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/oauth/",
          "/login",
          // `$` anchors the bare segment so a future storefront page that merely
          // starts with the same letters (e.g. /mapping) stays crawlable.
          ...ADMIN_ROUTE_PREFIXES.flatMap((prefix) => [`${prefix}$`, `${prefix}/`]),
        ],
      },
    ],
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
    host: CANONICAL_ORIGIN,
  };
}
