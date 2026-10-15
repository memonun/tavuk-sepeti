import { describe, expect, it } from "vitest";

import { getTrustPage } from "./get-trust-pages";

describe("getTrustPage", () => {
  it("returns the intended public pages", () => {
    expect(getTrustPage("hakkimizda")?.title).toBe("Hakkımızda");
    expect(getTrustPage("ciftligimiz")?.title).toBe("Çiftliğimiz");
  });

  it.each(["unknown", "../hakkimizda", "Hakkimizda", ""])("does not resolve unknown slug %s", (slug) => {
    expect(getTrustPage(slug)).toBeNull();
  });
});
