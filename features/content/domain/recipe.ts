import type { z } from "zod";
import type { recipeSchema } from "./recipe.schema";

export { recipeSchema } from "./recipe.schema";
export type Recipe = z.infer<typeof recipeSchema>;
