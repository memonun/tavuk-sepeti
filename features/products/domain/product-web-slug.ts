import { slugifyProductKey } from "@/features/products/domain/product-key";

/** Keep URL slugs within 80 characters, including a collision suffix. */
export function deriveProductWebSlug(name: string, suffix = ""): string {
  const ending = suffix ? `-${suffix}` : "";
  const base = slugifyProductKey(name)
    .slice(0, 80 - ending.length)
    .replace(/-+$/g, "");
  return `${base}${ending}`;
}
