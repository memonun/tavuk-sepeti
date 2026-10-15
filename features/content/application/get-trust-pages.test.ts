import { describe, expect, it } from "vitest";

import { getPublishedTrustPages, getTrustPage } from "./get-trust-pages";

describe("getTrustPage", () => {
  it("returns the intended public pages when published", () => {
    expect(getTrustPage("hakkimizda", true)?.title).toBe("Hakkımızda");
    expect(getTrustPage("ciftligimiz", true)?.title).toBe("Çiftliğimiz");
  });

  it("resolves nothing while unpublished, so both routes 404", () => {
    expect(getTrustPage("hakkimizda", false)).toBeNull();
    expect(getTrustPage("ciftligimiz", false)).toBeNull();
  });

  it.each(["unknown", "../hakkimizda", "Hakkimizda", ""])("does not resolve unknown slug %s", (slug) => {
    expect(getTrustPage(slug, true)).toBeNull();
  });
});

describe("getPublishedTrustPages", () => {
  it("lists both pages only when published", () => {
    expect(getPublishedTrustPages(true).map((page) => page.slug)).toEqual(["hakkimizda", "ciftligimiz"]);
    expect(getPublishedTrustPages(false)).toEqual([]);
  });
});
