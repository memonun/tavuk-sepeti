import Image from "next/image";
import Link from "next/link";

import { productImagePublicUrl } from "@/features/products/application/product-image";
import type { Product } from "@/features/storefront/application/get-catalog";
import { env } from "@/shared/env";
import type { Recipe } from "../domain/recipe";

export function RecipeDetails({
  recipe,
  products,
}: {
  recipe: Recipe;
  products: readonly Product[];
}) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <nav
        aria-label="İçerik yolu"
        className="mb-6 flex flex-wrap items-center gap-2 text-base text-muted-foreground"
      >
        <Link
          href="/"
          className="shop-focus rounded underline underline-offset-4"
        >
          Ana sayfa
        </Link>
        <span aria-hidden>/</span>
        <Link
          href="/tarifler"
          className="shop-focus rounded underline underline-offset-4"
        >
          Tarifler
        </Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{recipe.title}</span>
      </nav>
      <article>
        <header className="grid items-center gap-8 md:grid-cols-2 lg:gap-12">
          <div>
            <h1 className="font-display text-4xl leading-tight sm:text-5xl">
              {recipe.title}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              {recipe.description}
            </p>
            <p className="mt-4 text-base text-muted-foreground">
              Apuhan Çiftliği ·{" "}
              <time dateTime={recipe.publishedAt}>
                {new Date(`${recipe.publishedAt}T00:00:00Z`).toLocaleDateString(
                  "tr-TR",
                  { dateStyle: "long", timeZone: "Europe/Istanbul" },
                )}
              </time>
            </p>
            <dl className="mt-6 grid grid-cols-3 gap-3 border-y border-border py-5 text-base">
              <div>
                <dt className="text-muted-foreground">Hazırlık</dt>
                <dd className="mt-1 font-bold">{recipe.prepMinutes} dk</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Pişirme</dt>
                <dd className="mt-1 font-bold">{recipe.cookMinutes} dk</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Porsiyon</dt>
                <dd className="mt-1 font-bold">{recipe.servings} kişilik</dd>
              </div>
            </dl>
          </div>
          <figure>
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-muted">
              <Image
                src={recipe.image}
                alt={recipe.imageAlt}
                fill
                preload
                sizes="(max-width: 767px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
            {recipe.image === "/tarifler/tarif-placeholder.png" ? (
              <figcaption className="mt-2 text-base text-muted-foreground">
                Tarif fotoğrafı yakında eklenecek.
              </figcaption>
            ) : null}
          </figure>
        </header>
        <div className="mt-12 grid gap-10 md:grid-cols-[1fr_2fr] lg:gap-16">
          <section aria-labelledby="recipe-ingredients">
            <h2 id="recipe-ingredients" className="font-display text-3xl">
              Malzemeler
            </h2>
            <ul className="mt-5 list-disc space-y-3 pl-5 text-lg leading-relaxed">
              {recipe.ingredients.map((ingredient, index) => (
                <li key={index}>{ingredient}</li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="recipe-steps">
            <h2 id="recipe-steps" className="font-display text-3xl">
              Nasıl yapılır?
            </h2>
            <ol className="mt-5 list-decimal space-y-5 pl-6 text-lg leading-relaxed marker:font-bold marker:text-primary">
              {recipe.steps.map((step, index) => (
                <li
                  key={index}
                  id={`adim-${index + 1}`}
                  className="scroll-mt-24 pl-2"
                >
                  {step}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </article>
      {products.length > 0 ? (
        <section
          aria-labelledby="recipe-products"
          className="mt-14 border-t border-border pt-10"
        >
          <h2 id="recipe-products" className="font-display text-3xl">
            Bu tarifte kullanılan ürünler
          </h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => {
              const image = productImagePublicUrl(
                product.image_path,
                env.NEXT_PUBLIC_SUPABASE_URL,
              );
              return product.web_slug ? (
                <Link
                  key={product.key}
                  href={`/urun/${product.web_slug}`}
                  className="shop-focus flex items-center gap-4 rounded-2xl border border-border bg-card p-4"
                >
                  {image ? (
                    <Image
                      src={image}
                      alt={product.image_alt ?? product.display_name}
                      width={80}
                      height={80}
                      className="size-20 shrink-0 rounded-xl object-cover"
                    />
                  ) : null}
                  <span>
                    <span className="block font-display text-2xl">
                      {product.display_name}
                    </span>
                    <span className="mt-1 block text-base text-primary underline underline-offset-4">
                      Ürünü incele
                    </span>
                  </span>
                </Link>
              ) : null;
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
