import { z } from "zod";

export const recipeSlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Reject calendar rollovers (e.g. February 30), not just malformed strings. */
export const recipeDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Geçerli bir takvim tarihi gerekli.");

const textSchema = z.string().trim().min(1);

export const recipeSchema = z.object({
  slug: recipeSlugSchema,
  title: textSchema,
  description: textSchema,
  publishedAt: recipeDateSchema,
  // Public URLs omit the public/ prefix. No traversal, query strings or remote URLs.
  image: z
    .string()
    .regex(/^\/tarifler\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(?:jpg|jpeg|png|webp)$/),
  imageAlt: textSchema,
  prepMinutes: z.number().int().nonnegative(),
  cookMinutes: z.number().int().nonnegative(),
  // Hands-off waiting (fermenting, chilling). Counted in JSON-LD totalTime so
  // Google never sees a 50-minute yogurt that really takes half a day.
  restMinutes: z.number().int().nonnegative(),
  servings: z.number().int().positive(),
  ingredients: z.array(textSchema).min(1),
  steps: z.array(textSchema).min(1),
  // Mirrors products.web_slug's public URL contract; never a product primary key.
  productSlugs: z.array(
    z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  ),
});

export const recipeCollectionSchema = z
  .array(recipeSchema)
  .superRefine((recipes, ctx) => {
    const seen = new Set<string>();
    recipes.forEach((recipe, index) => {
      if (seen.has(recipe.slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "slug"],
          message: "Tarif adresleri benzersiz olmalı.",
        });
      }
      seen.add(recipe.slug);
    });
  });

export const recipeParamsSchema = z.object({ slug: recipeSlugSchema });
