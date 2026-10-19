import type { Metadata } from "next";

import { getRecipesNewestFirst } from "@/features/content/application/get-recipes";
import { buildPageMetadata } from "@/features/storefront/application/page-metadata";
import { RecipeIndex } from "@/features/content/ui/recipe-index";

export const metadata: Metadata = buildPageMetadata({
  title: "Köy yumurtalı ev tarifleri",
  description:
    "Köy yumurtalı menemen ve fırında yumurtalı patates gibi ölçülü, adım adım ev tarifleri. Apuhan Çiftliği'nin mutfağından.",
  canonical: "/tarifler",
});

export default function RecipesPage() {
  return <RecipeIndex recipes={getRecipesNewestFirst()} />;
}
