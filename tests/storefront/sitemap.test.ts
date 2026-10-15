import { beforeEach, describe, expect, it, vi } from "vitest";
import sitemap from "@/app/sitemap";
import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { buildStorefrontSitemapEntries } from "@/features/storefront/domain/sitemap-entries";
import { ExternalApiError } from "@/shared/errors/app-error";
import { err } from "@/shared/result";

vi.mock("@/features/storefront/application/get-catalog", () => ({
  getStorefrontCatalog: vi.fn(),
}));
vi.mock("@/shared/logger", () => ({ logger: { error: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
describe("sitemap failure recovery", () => {
  it("keeps static pages when the catalog returns a failed Result", async () => {
    vi.mocked(getStorefrontCatalog).mockResolvedValue(
      err(new ExternalApiError()),
    );
    expect(await sitemap()).toEqual(buildStorefrontSitemapEntries());
  });
  it("keeps static pages when an unexpected error is thrown", async () => {
    vi.mocked(getStorefrontCatalog).mockRejectedValue(
      new Error("network unavailable"),
    );
    expect(await sitemap()).toEqual(buildStorefrontSitemapEntries());
  });
});
