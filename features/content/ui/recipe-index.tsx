import Image from "next/image";
import Link from "next/link";

import type { Recipe } from "../domain/recipe";
import { formatRecipeMinutes } from "../domain/recipe-duration";

export function RecipeIndex({ recipes }: { recipes: readonly Recipe[] }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-base font-semibold text-primary">Çiftlikten sofraya</p>
      <h1 className="mt-2 font-display text-4xl sm:text-5xl">Tarifler</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        Köy yumurtasıyla evde hazırlayabileceğiniz tarifler.
        Malzemeleri, ölçüleri ve yapılış adımlarını bir arada bulabilirsiniz.
      </p>
      <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {recipes.map((recipe, index) => (
          <article key={recipe.slug} className="min-w-0">
            <Link
              href={`/tarifler/${recipe.slug}`}
              className="shop-focus block rounded-2xl"
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
                <Image
                  src={recipe.image}
                  alt={recipe.imageAlt}
                  fill
                  loading={index < 3 ? "eager" : "lazy"}
                  sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 360px"
                  className="object-cover"
                />
              </div>
              <h2 className="mt-4 font-display text-2xl underline-offset-4 hover:underline">
                {recipe.title}
              </h2>
            </Link>
            <p className="mt-2 text-base text-muted-foreground">
              {formatRecipeMinutes(recipe.prepMinutes + recipe.cookMinutes)}{" "}
              hazırlık ve pişirme
              {recipe.restMinutes > 0
                ? ` + ${formatRecipeMinutes(recipe.restMinutes)} bekleme`
                : ""}{" "}
              ·{" "}
              {recipe.servings} porsiyon
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              {recipe.description}
            </p>
            <time
              dateTime={recipe.publishedAt}
              className="mt-3 block text-base text-muted-foreground"
            >
              {new Date(`${recipe.publishedAt}T00:00:00Z`).toLocaleDateString(
                "tr-TR",
                { dateStyle: "long", timeZone: "Europe/Istanbul" },
              )}
            </time>
          </article>
        ))}
      </div>
    </main>
  );
}
