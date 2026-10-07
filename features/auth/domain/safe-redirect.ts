/**
 * Post-login redirect targets come from a query string, i.e. from the
 * attacker's side of the fence. Accept only same-site absolute PATHS — never a
 * scheme, host, protocol-relative (`//evil.com`) or backslash form (browsers
 * treat `/\evil.com` like `//evil.com`) — otherwise /login?next=… is an open
 * redirect.
 */
export function safeInternalPath(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  if (raw.length === 0 || raw.length > 500) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;
  // Control characters (CR/LF/tab) can smuggle a different URL past the parser.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  return raw;
}
