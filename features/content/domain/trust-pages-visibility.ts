/**
 * The one switch for /hakkimizda and /ciftligimiz.
 *
 * Off from 2026-10-15 until the copy was rewritten; back on the same day with
 * the owner's own letter and photos. While off, both URLs return 404 (so
 * search engines drop them) and they leave the footer, the mobile menu and the
 * sitemap. The content in trust-pages.ts stays in the repo either way.
 *
 * Kept in its own import-free module so the client-side mobile menu can read
 * it without bundling the page content.
 */
export const TRUST_PAGES_PUBLISHED: boolean = true;
