import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";
import type { Recipe } from "./recipe";

/** The recipe author as a schema.org Person (the storefront's founder node). */
export interface RecipeAuthor {
  readonly "@type": "Person";
  readonly "@id": string;
  readonly name: string;
}

/**
 * Pure JSON-LD: identical content and ordering to the visible recipe. The
 * author is passed in (it lives in the storefront feature); the publisher is
 * the organization the storefront layout already emits, referenced by @id.
 */
export function buildRecipeStructuredData(recipe: Recipe, author: RecipeAuthor) {
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
        author,
        publisher: { "@id": `${CANONICAL_ORIGIN}/#organization` },
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
