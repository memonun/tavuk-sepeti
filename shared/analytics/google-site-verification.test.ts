import { afterEach, describe, expect, it, vi } from "vitest";

import { getGoogleSiteVerification } from "./google-site-verification";

const VALID = "abcDEF123_-abcDEF123_-abcDEF123_-abcDEF123";
const COMMITTED = "r6EkBUUI2OVoLAJDMcOuNfsBEpIvz0bHzZVel-D0OS8";

describe("getGoogleSiteVerification", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the committed Search Console token when the variable is unset or blank", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION", "");
    expect(getGoogleSiteVerification()).toBe(COMMITTED);
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION", "   ");
    expect(getGoogleSiteVerification()).toBe(COMMITTED);
  });

  it("returns a well-formed token, trimmed", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION", `  ${VALID}  `);
    expect(getGoogleSiteVerification()).toBe(VALID);
  });

  it("ignores a pasted whole meta tag or anything with unsafe characters", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION",
      `<meta name="google-site-verification" content="${VALID}" />`,
    );
    expect(getGoogleSiteVerification()).toBe(COMMITTED);
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION", `${VALID}"`);
    expect(getGoogleSiteVerification()).toBe(COMMITTED);
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION", "short");
    expect(getGoogleSiteVerification()).toBe(COMMITTED);
  });
});
