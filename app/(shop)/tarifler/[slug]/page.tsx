import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRecipeProducts } from "@/features/content/application/get-recipe-products";
import {
  getRecipeBySlug,
  getRecipesNewestFirst,
  recipeParamsSchema,
} from "@/features/content/application/get-recipes";
import { buildRecipeStructuredData } from "@/features/content/domain/recipe-structured-data";
import { RecipeDetails } from "@/features/content/ui/recipe-details";
import { buildPageMetadata } from "@/features/storefront/application/page-metadata";
import { FOUNDER_PERSON } from "@/features/storefront/domain/structured-data";

type PageProps = { params: Promise<{ slug: string }> };

async function resolveRecipe(params: PageProps["params"]) {
  const parsed = recipeParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const recipe = getRecipeBySlug(parsed.data.slug);
  if (!recipe) notFound();
  return recipe;
}

export function generateStaticParams() {
  return getRecipesNewestFirst().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const recipe = await resolveRecipe(params);
  return buildPageMetadata({
    title: recipe.title,
    description: recipe.description,
    canonical: `/tarifler/${recipe.slug}`,
    image: { url: recipe.image, alt: recipe.imageAlt },
    article: { publishedTime: recipe.publishedAt },
  });
}

export default async function RecipePage({ params }: PageProps) {
  const recipe = await resolveRecipe(params);
  const products = await getRecipeProducts(recipe);
  // A catalog outage is not a permanently missing recipe/product.
  if (!products.ok) throw new Error(products.error.message);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildRecipeStructuredData(recipe, FOUNDER_PERSON)).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      <RecipeDetails recipe={recipe} products={products.value} />
    </>
  );
}
