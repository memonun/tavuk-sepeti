import { afterEach, describe, expect, it, vi } from "vitest";

import { getGoogleSiteVerification } from "./google-site-verification";

const VALID = "abcDEF123_-abcDEF123_-abcDEF123_-abcDEF123";

describe("getGoogleSiteVerification", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off when the variable is unset or blank", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION", "");
    expect(getGoogleSiteVerification()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION", "   ");
    expect(getGoogleSiteVerification()).toBeNull();
  });

  it("returns a well-formed token, trimmed", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION", `  ${VALID}  `);
    expect(getGoogleSiteVerification()).toBe(VALID);
  });

  it("refuses a pasted whole meta tag or anything with unsafe characters", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION",
      `<meta name="google-site-verification" content="${VALID}" />`,
    );
    expect(getGoogleSiteVerification()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION", `${VALID}"`);
    expect(getGoogleSiteVerification()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION", "short");
    expect(getGoogleSiteVerification()).toBeNull();
  });
});
