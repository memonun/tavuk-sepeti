/**
 * `next` reaches us from query strings, form fields and links inside e-mails —
 * all attacker-writable. These tests pin the open-redirect boundary, plus the
 * one shape that looks wrong but must be accepted: the absolute same-origin URL
 * that `{{ .RedirectTo }}` expands to inside the Supabase mail template.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://shop.example.com" },
}));

const { safeNextPath } = await import("@/shared/utils/next-path");

describe("safeNextPath", () => {
  it("keeps an ordinary same-origin path", () => {
    expect(safeNextPath("/odeme")).toBe("/odeme");
    expect(safeNextPath("/hesap?tab=siparisler")).toBe("/hesap?tab=siparisler");
  });

  it("reduces the absolute same-origin URL the mail template produces", () => {
    // This is literally what `next={{ .RedirectTo }}` yields.
    expect(safeNextPath("https://shop.example.com/odeme")).toBe("/odeme");
  });

  it("refuses to leave the origin", () => {
    // Protocol-relative: the browser reads this as another host.
    expect(safeNextPath("//evil.example")).toBe("/hesap");
    // Some browsers normalise the backslash to a slash, same escape.
    expect(safeNextPath("/\\evil.example")).toBe("/hesap");
    expect(safeNextPath("https://evil.example/odeme")).toBe("/hesap");
    expect(safeNextPath("http://shop.example.com/odeme")).toBe("/hesap");
  });

  it("falls back on anything that isn't a usable destination", () => {
    expect(safeNextPath(null)).toBe("/hesap");
    expect(safeNextPath(undefined)).toBe("/hesap");
    expect(safeNextPath("")).toBe("/hesap");
    expect(safeNextPath("odeme")).toBe("/hesap");
    expect(safeNextPath("javascript:alert(1)")).toBe("/hesap");
  });

  it("honours a caller-supplied fallback", () => {
    expect(safeNextPath(null, "/odeme")).toBe("/odeme");
  });
});
