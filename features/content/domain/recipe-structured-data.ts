import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";
import type { Recipe } from "./recipe";

/** Pure JSON-LD: identical content and ordering to the visible recipe. */
export function buildRecipeStructuredData(recipe: Recipe) {
  const canonical = `${CANONICAL_ORIGIN}/tarifler/${recipe.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Recipe",
        name: recipe.title,
        image: `${CANONICAL_ORIGIN}${recipe.image}`,
        description: recipe.description,
        datePublished: recipe.publishedAt,
        prepTime: `PT${recipe.prepMinutes}M`,
        cookTime: `PT${recipe.cookMinutes}M`,
        totalTime: `PT${recipe.prepMinutes + recipe.cookMinutes + recipe.restMinutes}M`,
        recipeYield: `${recipe.servings} porsiyon`,
        recipeIngredient: [...recipe.ingredients],
        recipeInstructions: recipe.steps.map((text, index) => ({
          "@type": "HowToStep",
          text,
          url: `${canonical}#adim-${index + 1}`,
        })),
        author: { "@type": "Organization", name: "Apuhan Çiftliği" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Ana sayfa",
            item: CANONICAL_ORIGIN,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Tarifler",
            item: `${CANONICAL_ORIGIN}/tarifler`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: recipe.title,
            item: canonical,
          },
        ],
      },
    ],
  } as const;
}
