import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorefrontProductBySlug } from "@/features/storefront/application/get-product-by-slug";
import type { Product } from "@/features/storefront/application/get-catalog";
import { ExternalApiError } from "@/shared/errors/app-error";
import { err, ok } from "@/shared/result";
import { getRecipeProducts } from "./get-recipe-products";

vi.mock("@/features/storefront/application/get-product-by-slug", () => ({
  getStorefrontProductBySlug: vi.fn(),
}));
const product = { key: "eggs", web_slug: "koy-yumurtasi" } as Product;

beforeEach(() => vi.resetAllMocks());

describe("getRecipeProducts", () => {
  it("resolves unique public slugs and silently skips missing products", async () => {
    vi.mocked(getStorefrontProductBySlug).mockImplementation(async (slug) =>
      ok(slug === "koy-yumurtasi" ? product : null),
    );
    expect(
      await getRecipeProducts({
        productSlugs: ["koy-yumurtasi", "removed", "koy-yumurtasi"],
      }),
    ).toEqual(ok([product]));
    expect(getStorefrontProductBySlug).toHaveBeenCalledTimes(2);
    expect(getStorefrontProductBySlug).toHaveBeenCalledWith("removed");
  });
  it("returns no cards when every product is missing or the recipe has none", async () => {
    vi.mocked(getStorefrontProductBySlug).mockResolvedValue(ok(null));
    expect(await getRecipeProducts({ productSlugs: ["removed"] })).toEqual(
      ok([]),
    );
    expect(await getRecipeProducts({ productSlugs: [] })).toEqual(ok([]));
  });
  it("propagates outages instead of swallowing them as missing products", async () => {
    const failure = new ExternalApiError();
    vi.mocked(getStorefrontProductBySlug).mockResolvedValue(err(failure));
    expect(await getRecipeProducts({ productSlugs: ["sut"] })).toEqual(
      err(failure),
    );
  });
});
