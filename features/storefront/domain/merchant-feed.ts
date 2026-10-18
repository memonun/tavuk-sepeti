/**
 * Google Merchant Center product feed (RSS 2.0 + the `g:` namespace), served
 * at /merchant-feed.xml for free Shopping listings.
 *
 * What goes in, and why:
 *
 *   - Only CARGO-capable products (`fulfillment_type: "shipping"`). Shopping
 *     listings are shown across Türkiye; a delivery-only product (eggs) can
 *     only be bought inside Malatya, so listing it nationwide would show a
 *     shopper in another city something they cannot order. Local listings
 *     would need a separate (local inventory) setup.
 *   - Only products with a product page (`web_slug`) and a photo: Merchant
 *     Center rejects items without an image, and every item must link to a
 *     page that shows the same price.
 *
 * Every value mirrors what the product page and its Product JSON-LD show
 * (product-structured-data.ts): the same price, description and image, so
 * Merchant Center's landing-page check finds no mismatch. No GTIN exists for
 * farm goods, hence `identifier_exists: no`. No stock tracking in Faz 1
 * (CLAUDE.md §13), so a listed product is `in_stock` as it is on the site.
 *
 * No `g:shipping` on purpose: cargo is free to all of Türkiye EXCEPT that a
 * Malatya address turns the basket into a van delivery with the eve-servis
 * fee (fulfillment-channel.ts, owner decision 2026-08-13), and the feed has
 * no reliable way to name a Turkish province. Shipping is set once in the
 * Merchant Center account settings instead, where the owner can edit it.
 *
 * Pure: no I/O, no env.
 */
import type { FulfillmentChannel } from "@/features/storefront/domain/fulfillment-channel";
import { CANONICAL_ORIGIN } from "@/shared/canonical-origin";

export interface MerchantFeedProductInput {
  readonly key: string;
  readonly display_name: string;
  readonly web_slug: string | null;
  /** Absolute image URL, or null when the product has no photo. */
  readonly imageUrl: string | null;
  /** The price the product page shows (minimum-quantity unit rate), kuruş. */
  readonly priceMinor: number;
  readonly fulfillment_type: FulfillmentChannel;
  /** productStructuredDescription(product). */
  readonly description: string;
}

export interface MerchantFeedItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly link: string;
  readonly imageLink: string;
  readonly priceMinor: number;
}

export interface MerchantFeedSelection {
  readonly items: MerchantFeedItem[];
  /** Counted for the log, so a product silently missing from Shopping is explainable. */
  readonly excluded: { readonly deliveryOnly: number; readonly noPage: number; readonly noImage: number };
}

/** Merchant Center limits: title 150, description 5000 characters. */
const TITLE_MAX = 150;
const DESCRIPTION_MAX = 5000;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function selectMerchantFeedItems(
  products: readonly MerchantFeedProductInput[],
): MerchantFeedSelection {
  const excluded = { deliveryOnly: 0, noPage: 0, noImage: 0 };
  const items: MerchantFeedItem[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    if (seen.has(product.key)) continue;
    seen.add(product.key);
    if (product.fulfillment_type !== "shipping") {
      excluded.deliveryOnly += 1;
      continue;
    }
    if (!product.web_slug) {
      excluded.noPage += 1;
      continue;
    }
    if (!product.imageUrl) {
      excluded.noImage += 1;
      continue;
    }
    items.push({
      id: product.key,
      title: clip(product.display_name.trim(), TITLE_MAX),
      description: clip(product.description.trim(), DESCRIPTION_MAX),
      link: `${CANONICAL_ORIGIN}/urun/${product.web_slug}`,
      imageLink: product.imageUrl,
      priceMinor: product.priceMinor,
    });
  }
  return { items, excluded };
}

/** `12500` → `"125.00 TRY"`: Merchant Center's price format (dot decimal, ISO currency). */
export function formatMerchantPrice(minor: number): string {
  return `${(minor / 100).toFixed(2)} TRY`;
}

/**
 * Escapes text for an XML element body and drops characters XML 1.0 forbids
 * (control characters an admin could paste in), which would otherwise make
 * the whole feed unparseable.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface MerchantFeedOptions {
  readonly brand: string;
}

export function buildMerchantFeedXml(
  items: readonly MerchantFeedItem[],
  options: MerchantFeedOptions,
): string {
  const tag = (name: string, value: string) => `      <${name}>${escapeXml(value)}</${name}>`;
  const entries = items.map((item) =>
    [
      "    <item>",
      tag("g:id", item.id),
      tag("g:title", item.title),
      tag("g:description", item.description),
      tag("g:link", item.link),
      tag("g:image_link", item.imageLink),
      tag("g:availability", "in_stock"),
      tag("g:price", formatMerchantPrice(item.priceMinor)),
      tag("g:condition", "new"),
      tag("g:brand", options.brand),
      tag("g:identifier_exists", "no"),
      "    </item>",
    ].join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "  <channel>",
    `    <title>${escapeXml(options.brand)}</title>`,
    `    <link>${escapeXml(CANONICAL_ORIGIN)}</link>`,
    `    <description>${escapeXml(`${options.brand} ürünleri`)}</description>`,
    ...entries,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
