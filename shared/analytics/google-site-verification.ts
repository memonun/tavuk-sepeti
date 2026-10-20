/**
 * Google Search Console "HTML tag" verification — the ONE place that decides
 * whether `<meta name="google-site-verification">` is rendered.
 *
 *   NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION = the token Google shows   → that tag.
 *   NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION unset / blank / malformed → the
 *   committed `SEARCH_CONSOLE_TOKEN` below.
 *
 * The token is committed because setting the variable in Vercel did not reach
 * the live site (2026-10-20). It is public by design — Google reads it from
 * the page — so it is not a secret. Keep it while Search Console uses the
 * HTML-tag method, or the property loses verification. The site is also
 * verified by the file public/google8f84387896cdfee2.html.
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

/** apuhanciftligi.com's Search Console HTML-tag token (owner, 2026-10-20). */
const SEARCH_CONSOLE_TOKEN = "r6EkBUUI2OVoLAJDMcOuNfsBEpIvz0bHzZVel-D0OS8";

export function getGoogleSiteVerification(): string {
  const raw = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
  return raw && TOKEN_PATTERN.test(raw) ? raw : SEARCH_CONSOLE_TOKEN;
}
