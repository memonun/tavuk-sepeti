/**
 * "Where should we send the customer after this?" — the one place that answers it.
 *
 * Every auth entry point (login, signup, the e-mail confirmation landing) takes
 * a `next` from an untrusted source: a query string, a form field, or a link in
 * an e-mail. Letting any of them through unchecked turns the login page into an
 * open redirect, so the rule is the same everywhere and lives here rather than
 * being re-derived per route.
 *
 * Two shapes are accepted, because the confirmation mail forces the second one:
 *
 *   "/odeme"                    — an ordinary same-origin path.
 *   "https://our-domain/odeme"  — what `{{ .RedirectTo }}` expands to inside the
 *                                 Supabase mail template. It is the value we
 *                                 passed as `emailRedirectTo`, echoed back in
 *                                 full, so it arrives absolute whether we like
 *                                 it or not. Same-origin ones are reduced to a
 *                                 path; anything else falls back.
 *
 * Everything else is rejected: `//evil.com` because browsers read it as
 * protocol-relative to another host, `/\evil.com` because some browsers
 * normalise the backslash to a slash and get the same result, and any absolute
 * URL pointing somewhere we don't own.
 */
import { env } from "@/shared/env";

export const DEFAULT_NEXT_PATH = "/hesap";

export function safeNextPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_NEXT_PATH,
): string {
  if (typeof raw !== "string" || raw === "") return fallback;

  if (raw.startsWith("/")) {
    if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
    return raw;
  }

  // Absolute URL: keep it only if it is our own origin, and keep only the path.
  try {
    const candidate = new URL(raw);
    const appOrigin = new URL(env.NEXT_PUBLIC_APP_URL).origin;
    if (candidate.origin !== appOrigin) return fallback;
    return `${candidate.pathname}${candidate.search}` || fallback;
  } catch {
    return fallback;
  }
}
