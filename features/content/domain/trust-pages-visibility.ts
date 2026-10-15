/**
 * The one switch for /hakkimizda and /ciftligimiz.
 *
 * Off since 2026-10-15: the owner pulled both pages until the copy is
 * rewritten. While off, both URLs return 404 (so search engines drop them)
 * and they leave the footer, the mobile menu and the sitemap. The content in
 * trust-pages.ts stays in the repo; flip this to true to bring them back.
 *
 * Kept in its own import-free module so the client-side mobile menu can read
 * it without bundling the page content.
 */
export const TRUST_PAGES_PUBLISHED: boolean = false;
