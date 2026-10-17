import type { Metadata } from "next";

import { getRecipesNewestFirst } from "@/features/content/application/get-recipes";
import { buildPageMetadata } from "@/features/storefront/application/page-metadata";
import { RecipeIndex } from "@/features/content/ui/recipe-index";

export const metadata: Metadata = buildPageMetadata({
  title: "Köy yumurtası ve taze sütle tarifler",
  description:
    "Köy yumurtalı menemen, fırında yumurtalı patates ve taze sütle ev yapımı yoğurt. Apuhan Çiftliği'nden ölçülü, adım adım ev tarifleri.",
  canonical: "/tarifler",
});

export default function RecipesPage() {
  return <RecipeIndex recipes={getRecipesNewestFirst()} />;
}
