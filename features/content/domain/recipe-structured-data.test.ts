import { describe, expect, it } from "vitest";
import { buildRecipeStructuredData, type RecipeAuthor } from "./recipe-structured-data";
import { RECIPES } from "./recipes";

const recipe = RECIPES[0]!;
const origin = "https://apuhanciftligi.com";
const author: RecipeAuthor = {
  "@type": "Person",
  "@id": `${origin}/#founder`,
  name: "Hamit Apuhan",
};

describe("buildRecipeStructuredData", () => {
  it("maps visible content to Recipe without invented ratings", () => {
    const data = buildRecipeStructuredData(recipe, author);
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
      author,
      publisher: { "@id": `${origin}/#organization` },
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
      }, author)["@graph"][0];
      expect(data.prepTime).toBe(`PT${prepMinutes}M`);
      expect(data.cookTime).toBe(`PT${cookMinutes}M`);
      expect(data.totalTime).toBe(totalTime);
    },
  );

  it("counts hands-off waiting in totalTime but not in prep or cook time", () => {
    const data = buildRecipeStructuredData({
      ...recipe,
      prepMinutes: 30,
      cookMinutes: 20,
      restMinutes: 600,
    }, author)["@graph"][0];
    expect(data.prepTime).toBe("PT30M");
    expect(data.cookTime).toBe("PT20M");
    expect(data.totalTime).toBe("PT650M");
  });

  it("does not advertise yogurt as a 50-minute recipe", () => {
    const yogurt = RECIPES.find((item) => item.slug === "ev-yapimi-yogurt")!;
    expect(buildRecipeStructuredData(yogurt, author)["@graph"][0].totalTime).toBe(
      "PT650M",
    );
  });

  it("links ordered breadcrumbs only to existing routes", () => {
    expect(buildRecipeStructuredData(recipe, author)["@graph"][1]).toEqual({
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
