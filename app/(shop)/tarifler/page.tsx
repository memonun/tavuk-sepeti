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
    // A page-level openGraph replaces the layout's whole block, image included.
    images: [
      {
        url: "/brand/apuhan-onizleme.jpg",
        type: "image/jpeg",
        width: 1200,
        height: 630,
        alt: "Apuhan Çiftliği logosu ve “Çiftlikten sofranıza” yazısı",
      },
    ],
  },
};

export default function RecipesPage() {
  return <RecipeIndex recipes={getRecipesNewestFirst()} />;
}
