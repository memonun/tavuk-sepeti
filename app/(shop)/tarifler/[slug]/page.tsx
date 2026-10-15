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
  return {
    title: recipe.title,
    description: recipe.description,
    alternates: { canonical: `/tarifler/${recipe.slug}` },
    openGraph: {
      type: "article",
      title: recipe.title,
      description: recipe.description,
      url: `/tarifler/${recipe.slug}`,
      publishedTime: recipe.publishedAt,
      images: [{ url: recipe.image, alt: recipe.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: recipe.title,
      description: recipe.description,
      images: [recipe.image],
    },
  };
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
          __html: JSON.stringify(buildRecipeStructuredData(recipe)).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      <RecipeDetails recipe={recipe} products={products.value} />
    </>
  );
}
