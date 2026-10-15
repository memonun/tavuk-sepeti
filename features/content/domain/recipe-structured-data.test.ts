import { describe, expect, it } from "vitest";
import { buildRecipeStructuredData } from "./recipe-structured-data";
import { RECIPES } from "./recipes";

const recipe = RECIPES[0]!;
const origin = "https://apuhanciftligi.com";

describe("buildRecipeStructuredData", () => {
  it("maps visible content to Recipe without invented ratings", () => {
    const data = buildRecipeStructuredData(recipe);
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@graph"][0]).toEqual({
      "@type": "Recipe",
      name: recipe.title,
      image: `${origin}${recipe.image}`,
      description: recipe.description,
      datePublished: recipe.publishedAt,
      prepTime: "PT10M",
      cookTime: "PT15M",
      totalTime: "PT25M",
      recipeYield: "2 porsiyon",
      recipeIngredient: recipe.ingredients,
      recipeInstructions: recipe.steps.map((text, index) => ({
        "@type": "HowToStep",
        text,
        url: `${origin}/tarifler/${recipe.slug}#adim-${index + 1}`,
      })),
      author: { "@type": "Organization", name: "Apuhan Çiftliği" },
    });
  });

  it.each([
    [0, 0, "PT0M"],
    [15, 90, "PT105M"],
    [60, 120, "PT180M"],
  ] as const)(
    "uses valid ISO durations for %s + %s minutes",
    (prepMinutes, cookMinutes, totalTime) => {
      const data = buildRecipeStructuredData({
        ...recipe,
        prepMinutes,
        cookMinutes,
      })["@graph"][0];
      expect(data.prepTime).toBe(`PT${prepMinutes}M`);
      expect(data.cookTime).toBe(`PT${cookMinutes}M`);
      expect(data.totalTime).toBe(totalTime);
    },
  );

  it("links ordered breadcrumbs only to existing routes", () => {
    expect(buildRecipeStructuredData(recipe)["@graph"][1]).toEqual({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Ana sayfa", item: origin },
        {
          "@type": "ListItem",
          position: 2,
          name: "Tarifler",
          item: `${origin}/tarifler`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: recipe.title,
          item: `${origin}/tarifler/${recipe.slug}`,
        },
      ],
    });
  });
});
