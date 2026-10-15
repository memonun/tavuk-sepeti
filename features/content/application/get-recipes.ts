import { RECIPES } from "../domain/recipes";

export { recipeParamsSchema } from "../domain/recipe.schema";
export type { Recipe } from "../domain/recipe";

export function getRecipesNewestFirst() {
  return [...RECIPES].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
}

export function getRecipeBySlug(slug: string) {
  return RECIPES.find((recipe) => recipe.slug === slug) ?? null;
}
