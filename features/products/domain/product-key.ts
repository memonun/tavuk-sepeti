/**
 * Product key derivation. `products.key` is a permanent text PK referenced by
 * order_items (FK) and frozen into order snapshots — it's part of the wire
 * contract and never changes once shipped. For admin-created products we mint
 * a stable, URL/identifier-safe slug from the display name; the repository
 * guarantees uniqueness by suffixing on conflict.
 *
 * Pure + deterministic so it can be unit-tested without a DB.
 */

// Turkish → ASCII transliteration (covers both cases). Applied before the
// generic non-alphanumeric strip so "Köy Yumurtası" → "koy-yumurtasi", not
// "k-y-yumurtas".
const TR_MAP: Record<string, string> = {
  ç: "c", Ç: "c",
  ğ: "g", Ğ: "g",
  ı: "i", I: "i",
  i: "i", İ: "i",
  ö: "o", Ö: "o",
  ş: "s", Ş: "s",
  ü: "u", Ü: "u",
};

/** Fallback when a name has no slug-able characters (e.g. only emoji). */
export const PRODUCT_KEY_FALLBACK = "urun";

/**
 * Slugify a product display name into a base key: transliterate Turkish
 * characters, lowercase, replace any run of non-alphanumerics with a single
 * dash, and trim leading/trailing dashes. Returns {@link PRODUCT_KEY_FALLBACK}
 * when the result would be empty.
 */
export function slugifyProductKey(name: string): string {
  const transliterated = Array.from(name)
    .map((ch) => TR_MAP[ch] ?? ch)
    .join("");

  const slug = transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : PRODUCT_KEY_FALLBACK;
}
