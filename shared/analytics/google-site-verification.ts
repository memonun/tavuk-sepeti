/**
 * Google Search Console "HTML tag" verification — the ONE place that decides
 * whether `<meta name="google-site-verification">` is rendered.
 *
 *   NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION unset / blank / malformed → no tag.
 *   NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION = the token Google shows   → tag.
 *
 * Only needed when the site is verified with the HTML-tag method; a Domain
 * property verified by DNS TXT record needs nothing here.
 *
 * Deliberately NOT part of shared/env.ts's boot validation (same reasoning as
 * meta-pixel-config.ts): a typo in a verification token must never take the
 * shop down at startup — a malformed value simply means "no tag". Referenced
 * as the literal `process.env.…` so Next inlines it at build time.
 */

/** Google's tokens are URL-safe base64 (~43 chars today). The charset rule
 *  also makes the value safe to embed in an attribute. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;

export function getGoogleSiteVerification(): string | null {
  const raw = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
  return raw && TOKEN_PATTERN.test(raw) ? raw : null;
}
