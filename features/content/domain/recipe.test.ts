import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { recipeSchema } from "./recipe";
import {
  recipeCollectionSchema,
  recipeDateSchema,
  recipeParamsSchema,
} from "./recipe.schema";
import { RECIPES } from "./recipes";

const example = RECIPES[0]!;

describe("repo recipes", () => {
  it("has unique slugs and valid content for every recipe", () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(3);
    expect(new Set(RECIPES.map((recipe) => recipe.slug)).size).toBe(
      RECIPES.length,
    );
    for (const recipe of RECIPES) {
      expect(recipeSchema.safeParse(recipe).success, recipe.slug).toBe(true);
      expect(recipe.ingredients.length).toBeGreaterThan(0);
      expect(recipe.steps.length).toBeGreaterThan(0);
      expect(
        existsSync(join(process.cwd(), "public", recipe.image)),
        recipe.image,
      ).toBe(true);
    }
  });

  it("rejects duplicate slugs at content load", () => {
    expect(recipeCollectionSchema.safeParse([example, example]).success).toBe(
      false,
    );
  });

  it.each([
    "2026-02-29",
    "2026-02-30",
    "2026-04-31",
    "2026-13-01",
    "2026-00-10",
    "2026-1-01",
    "15-10-2026",
    "no-date",
  ])("rejects invalid date %s", (date) => {
    expect(recipeDateSchema.safeParse(date).success).toBe(false);
  });

  it.each(["2024-02-29", "2026-10-15"])("accepts calendar date %s", (date) => {
    expect(recipeDateSchema.parse(date)).toBe(date);
  });

  it.each(["ingredients", "steps"] as const)(
    "rejects empty or blank %s",
    (field) => {
      expect(recipeSchema.safeParse({ ...example, [field]: [] }).success).toBe(
        false,
      );
      expect(
        recipeSchema.safeParse({ ...example, [field]: [" "] }).success,
      ).toBe(false);
    },
  );

  it.each(["../sut", "Köy", "-tarif", "tarif-", "tarif--adi", ""])(
    "rejects unsafe route slug %s",
    (slug) => {
      expect(recipeParamsSchema.safeParse({ slug }).success).toBe(false);
      expect(
        recipeSchema.safeParse({ ...example, productSlugs: [slug] }).success,
      ).toBe(false);
    },
  );

  it.each([
    "https://example.com/image.png",
    "/brand/logo.png",
    "/tarifler/../logo.png",
    "/tarifler/a.png?x=1",
  ])("rejects image outside the local recipe directory: %s", (image) => {
    expect(recipeSchema.safeParse({ ...example, image }).success).toBe(false);
  });

  it.each([{ prepMinutes: -1 }, { cookMinutes: 1.5 }, { servings: 0 }])(
    "rejects invalid quantities %j",
    (values) => {
      expect(recipeSchema.safeParse({ ...example, ...values }).success).toBe(
        false,
      );
    },
  );
});
