import { describe, expect, it, vi } from "vitest";
import { getRecipeBySlug, getRecipesNewestFirst } from "./get-recipes";

vi.mock("../domain/recipes", () => ({
  RECIPES: [
    { slug: "older", publishedAt: "2026-01-10" },
    { slug: "newest", publishedAt: "2026-10-15" },
    { slug: "middle", publishedAt: "2026-06-01" },
  ],
}));

describe("recipe reads", () => {
  it("sorts newest first without changing the source list", () => {
    expect(getRecipesNewestFirst().map((recipe) => recipe.slug)).toEqual([
      "newest",
      "middle",
      "older",
    ]);
    expect(getRecipeBySlug("older")?.publishedAt).toBe("2026-01-10");
    expect(getRecipesNewestFirst()).not.toBe(getRecipesNewestFirst());
  });
  it("returns null for an unknown slug", () => {
    expect(getRecipeBySlug("unknown")).toBeNull();
  });
});
