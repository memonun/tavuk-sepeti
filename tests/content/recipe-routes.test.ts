import { beforeEach, describe, expect, it, vi } from "vitest";
import RecipePage, {
  generateMetadata,
  generateStaticParams,
} from "@/app/(shop)/tarifler/[slug]/page";
import sitemap from "@/app/sitemap";
import { RECIPES } from "@/features/content/domain/recipes";
import { TRUST_PAGES_PUBLISHED } from "@/features/content/application/trust-pages-visibility";
import { getRecipeProducts } from "@/features/content/application/get-recipe-products";
import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { ExternalApiError } from "@/shared/errors/app-error";
import { err, ok } from "@/shared/result";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
  unstable_rethrow: vi.fn(),
}));
vi.mock("@/features/content/application/get-recipe-products", () => ({
  getRecipeProducts: vi.fn(),
}));
vi.mock("@/features/storefront/application/get-catalog", () => ({
  getStorefrontCatalog: vi.fn(),
}));
vi.mock("@/features/content/ui/recipe-details", () => ({
  RecipeDetails: () => null,
}));
vi.mock("@/shared/logger", () => ({ logger: { error: vi.fn() } }));

beforeEach(() => vi.resetAllMocks());

describe("recipe routes", () => {
  it("generates every content slug for static params", () => {
    expect(generateStaticParams()).toEqual(
      RECIPES.map(({ slug }) => ({ slug })),
    );
  });
  it.each(RECIPES)(
    "uses the canonical and recipe image for $slug",
    async (recipe) => {
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: recipe.slug }),
      });
      expect(metadata).toMatchObject({
        title: recipe.title,
        description: recipe.description,
        alternates: { canonical: `/tarifler/${recipe.slug}` },
        openGraph: {
          url: `/tarifler/${recipe.slug}`,
          images: [{ url: recipe.image, alt: recipe.imageAlt }],
        },
        twitter: { images: [recipe.image] },
      });
    },
  );
  it.each(["missing", "../sut", "Köy", "-bad"])(
    "returns 404 for %s before loading products",
    async (slug) => {
      await expect(
        RecipePage({ params: Promise.resolve({ slug }) }),
      ).rejects.toThrow("404");
      await expect(
        generateMetadata({ params: Promise.resolve({ slug }) }),
      ).rejects.toThrow("404");
      expect(getRecipeProducts).not.toHaveBeenCalled();
    },
  );
  it("keeps recipe rendering available when linked products are absent", async () => {
    vi.mocked(getRecipeProducts).mockResolvedValue(ok([]));
    expect(
      await RecipePage({ params: Promise.resolve({ slug: RECIPES[0]!.slug }) }),
    ).toBeTruthy();
  });
  it("does not turn a catalog outage into a permanent 404", async () => {
    const failure = new ExternalApiError();
    vi.mocked(getRecipeProducts).mockResolvedValue(err(failure));
    await expect(
      RecipePage({ params: Promise.resolve({ slug: RECIPES[0]!.slug }) }),
    ).rejects.toThrow(failure.message);
  });
});

describe("recipe and trust sitemap URLs", () => {
  it.each(["available", "failed", "throws"])(
    "includes recipes, and trust pages only when published, when the catalog is %s",
    async (state) => {
      const failure = new ExternalApiError();
      if (state === "available")
        vi.mocked(getStorefrontCatalog).mockResolvedValue(ok([]));
      else if (state === "failed")
        vi.mocked(getStorefrontCatalog).mockResolvedValue(err(failure));
      else vi.mocked(getStorefrontCatalog).mockRejectedValue(failure);
      const entries = await sitemap();
      expect(
        entries.some(
          (entry) => entry.url === "https://apuhanciftligi.com/tarifler",
        ),
      ).toBe(true);
      for (const recipe of RECIPES) {
        expect(entries).toContainEqual(
          expect.objectContaining({
            url: `https://apuhanciftligi.com/tarifler/${recipe.slug}`,
            lastModified: recipe.publishedAt,
          }),
        );
      }
      expect(new Set(entries.map((entry) => entry.url)).size).toBe(
        entries.length,
      );
      // Trust pages follow their publish switch in every catalog state.
      for (const path of ["/hakkimizda", "/ciftligimiz"]) {
        const listed = entries.some((entry) => entry.url === `https://apuhanciftligi.com${path}`);
        expect(listed, path).toBe(TRUST_PAGES_PUBLISHED);
      }
      expect(entries.some((entry) => entry.url.endsWith("/sss"))).toBe(false);
    },
  );
});
