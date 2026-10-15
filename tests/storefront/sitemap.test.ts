import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import sitemap from "@/app/sitemap";
import { getRecipesNewestFirst } from "@/features/content/application/get-recipes";
import { getPublishedTrustPages } from "@/features/content/application/get-trust-pages";
import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { buildStorefrontSitemapEntries } from "@/features/storefront/domain/sitemap-entries";
import { ExternalApiError } from "@/shared/errors/app-error";
import { err, ok } from "@/shared/result";

import type { Product } from "@/features/storefront/application/get-catalog";

vi.mock("@/features/storefront/application/get-catalog", () => ({
  getStorefrontCatalog: vi.fn(),
}));
vi.mock("@/shared/logger", () => ({ logger: { error: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());

// Static pages as the sitemap lists them right now: the trust pages follow their publish switch.
const staticUrls = buildStorefrontSitemapEntries([], [], getPublishedTrustPages()).map((entry) => entry.url);
const recipeUrls = getRecipesNewestFirst().map((recipe) => `https://apuhanciftligi.com/tarifler/${recipe.slug}`);
const urlsOf = (items: Awaited<ReturnType<typeof sitemap>>) => items.map((item) => item.url);

describe("sitemap", () => {
  it("adds one URL per product slug to the static pages", async () => {
    vi.mocked(getStorefrontCatalog).mockResolvedValue(
      ok([{ web_slug: "yumurta" }, { web_slug: null }] as unknown as Product[]),
    );
    expect(urlsOf(await sitemap())).toEqual([
      ...staticUrls,
      "https://apuhanciftligi.com/urun/yumurta",
      ...recipeUrls,
    ]);
  });

  it("serialises only sitemap fields (no internal path)", async () => {
    vi.mocked(getStorefrontCatalog).mockResolvedValue(ok([]));
    for (const item of await sitemap()) expect(item).not.toHaveProperty("path");
  });
});

describe("sitemap failure recovery", () => {
  it("keeps static pages when the catalog returns a failed Result", async () => {
    vi.mocked(getStorefrontCatalog).mockResolvedValue(
      err(new ExternalApiError()),
    );
    expect(urlsOf(await sitemap())).toEqual([...staticUrls, ...recipeUrls]);
  });
  it("keeps static pages when an unexpected error is thrown", async () => {
    vi.mocked(getStorefrontCatalog).mockRejectedValue(
      new Error("network unavailable"),
    );
    expect(urlsOf(await sitemap())).toEqual([...staticUrls, ...recipeUrls]);
  });
  // Next signals "this route is dynamic" / redirects by throwing; swallowing
  // those would make the build prerender a sitemap with no products.
  it("lets Next.js control-flow errors through", async () => {
    vi.mocked(getStorefrontCatalog).mockImplementation(() => redirect("/"));
    await expect(sitemap()).rejects.toThrow();
  });
});
