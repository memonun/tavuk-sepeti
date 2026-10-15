import type { Metadata } from "next";

import { getRecipesNewestFirst } from "@/features/content/application/get-recipes";
import { RecipeIndex } from "@/features/content/ui/recipe-index";

export const metadata: Metadata = {
  title: "Köy yumurtası ve taze sütle tarifler",
  description:
    "Köy yumurtalı menemen, fırında yumurtalı patates ve taze sütle ev yapımı yoğurt. Apuhan Çiftliği'nden ölçülü, adım adım ev tarifleri.",
  alternates: { canonical: "/tarifler" },
  openGraph: {
    title: "Tarifler | Apuhan Çiftliği",
    description:
      "Köy yumurtası ve taze sütle hazırlanan, adım adım ev tarifleri.",
    url: "/tarifler",
  },
};

export default function RecipesPage() {
  return <RecipeIndex recipes={getRecipesNewestFirst()} />;
}
