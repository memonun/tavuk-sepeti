import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { productImagePublicUrl } from "@/features/products/application/product-image";
import { productWebSlugSchema } from "@/features/products/application/product-web-slug";
import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { getStorefrontProductBySlug } from "@/features/storefront/application/get-product-by-slug";
import { buildPageMetadata } from "@/features/storefront/application/page-metadata";
import {
  buildProductStructuredData,
  productPageDescription,
} from "@/features/storefront/domain/product-structured-data";
import { fromPriceMinor } from "@/features/storefront/ui/line-pricing";
import { ProductDetails } from "@/features/storefront/ui/product-details";
import { env } from "@/shared/env";

const paramsSchema = z.object({ slug: productWebSlugSchema });
type PageProps = { params: Promise<{ slug: string }> };

async function resolveProduct(params: PageProps["params"]) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const result = await getStorefrontProductBySlug(parsed.data.slug);
  // A temporary catalog outage must not be indexed as a permanent 404.
  if (!result.ok) throw new Error(result.error.message);
  if (!result.value) notFound();
  return { product: result.value, slug: parsed.data.slug };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { product, slug } = await resolveProduct(params);
  const description = productPageDescription(product);
  const image = productImagePublicUrl(
    product.image_path,
    env.NEXT_PUBLIC_SUPABASE_URL,
  );
  return buildPageMetadata({
    title: product.display_name,
    description,
    canonical: `/urun/${slug}`,
    // No product photo → the site's default card, never an empty preview.
    image: image ? { url: image, alt: product.image_alt ?? product.display_name } : null,
  });
}

export default async function ProductPage({ params }: PageProps) {
  const { product, slug } = await resolveProduct(params);
  const catalog = await getStorefrontCatalog();
  if (!catalog.ok) throw new Error(catalog.error.message);
  const related = catalog.value
    .filter((item) => item.key !== product.key && item.web_slug !== null)
    .sort(
      (a, b) =>
        Number(b.fulfillment_type === product.fulfillment_type) -
        Number(a.fulfillment_type === product.fulfillment_type),
    )
    .slice(0, 3);
  const imageUrl = productImagePublicUrl(
    product.image_path,
    env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const structuredData = buildProductStructuredData({
    ...product,
    slug,
    image: imageUrl,
    priceMinor: fromPriceMinor(product),
  });
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <ProductDetails product={product} imageUrl={imageUrl} related={related} />
    </>
  );
}
