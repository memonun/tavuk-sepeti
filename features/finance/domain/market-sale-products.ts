/**
 * Products sold at a market stall: the pure rules behind the sale form's
 * quantity sheet and the "what was sold" displays. No I/O, no framework.
 *
 * Line items are informational (see market-sale.ts) — they feed the
 * "Satılan Ürünler" views and need not add up to the sale's typed total.
 */

/** A catalog product as the market-sale UI needs it (priced/labelled). */
export interface MarketProductOption {
  readonly key: string;
  readonly display_name: string;
  readonly unit_label: string;
  /** products.unit enum value ("package" | "liter" | "kilogram" | "piece"). */
  readonly unit: string;
  readonly current_unit_price_minor: number;
  readonly price_tiers: ReadonlyArray<{ readonly min_qty: number; readonly unit_price_minor: number }>;
}

const UNIT_FALLBACK: Readonly<Record<string, string>> = {
  package: "paket",
  liter: "lt",
  kilogram: "kg",
  piece: "adet",
};

/**
 * The unit text to show next to a quantity. `unit_label` is free admin text and
 * is sometimes just a number ("1" on some kilogram products), which reads as
 * "3 1" — in that case (or when blank) fall back to the product's unit enum.
 */
export function displayUnit(unitLabel: string, unit: string): string {
  const label = unitLabel.trim();
  if (label !== "" && !/^[\d.,\s]+$/.test(label)) return label;
  return UNIT_FALLBACK[unit] ?? label;
}

/** `20` → "20", `2.5` → "2,5", `0.125` → "0,13" (at most two decimals, tr-TR). */
export function formatQuantity(quantity: number): string {
  return quantity.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

export interface SoldLine {
  readonly product_name: string;
  readonly quantity: number;
  readonly unit_label: string;
  readonly unit: string;
}

/** "Yumurta 20 paket · Süt 5 lt" — one line per sale for the table. */
export function summarizeSoldLines(lines: ReadonlyArray<SoldLine>): string {
  return lines
    .map((l) => `${l.product_name} ${formatQuantity(l.quantity)} ${displayUnit(l.unit_label, l.unit)}`)
    .join(" · ");
}

export type ParsedQuantity =
  | { readonly kind: "empty" }
  | { readonly kind: "ok"; readonly value: number }
  | { readonly kind: "invalid" };

/** A quantity box: blank = "not sold", a positive number = sold, anything else is an error. */
export function parseQuantityText(text: string): ParsedQuantity {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "empty" };
  const normalized = trimmed.replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return { kind: "invalid" };
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? { kind: "ok", value } : { kind: "invalid" };
}

/**
 * The valid lines typed so far, silently skipping blank AND invalid boxes — for
 * live feedback (count, catalog estimate) while typing, where a half-typed
 * "2," must not blank the whole summary. Submitting uses the strict
 * `buildSaleItems`, which refuses to save with an invalid box.
 */
export function collectSoldItems(
  quantities: Readonly<Record<string, string>>,
  orderedKeys: ReadonlyArray<string>,
): Array<{ product_key: string; quantity: number }> {
  const items: Array<{ product_key: string; quantity: number }> = [];
  for (const key of orderedKeys) {
    const parsed = parseQuantityText(quantities[key] ?? "");
    if (parsed.kind === "ok") items.push({ product_key: key, quantity: parsed.value });
  }
  return items;
}

export type BuildItemsResult =
  | { readonly ok: true; readonly items: ReadonlyArray<{ product_key: string; quantity: number }> }
  | { readonly ok: false; readonly productKey: string };

/**
 * Turn the form's `product_key → typed quantity` sheet into line items: blank
 * boxes are dropped (and 0 counts as blank-equivalent invalid → reported, so a
 * stray "0" is not silently kept or silently lost), the first invalid box is
 * named so the form can point at it. Order follows `orderedKeys`.
 */
export function buildSaleItems(
  quantities: Readonly<Record<string, string>>,
  orderedKeys: ReadonlyArray<string>,
): BuildItemsResult {
  const items: Array<{ product_key: string; quantity: number }> = [];
  for (const key of orderedKeys) {
    const parsed = parseQuantityText(quantities[key] ?? "");
    if (parsed.kind === "empty") continue;
    if (parsed.kind === "invalid") return { ok: false, productKey: key };
    items.push({ product_key: key, quantity: parsed.value });
  }
  return { ok: true, items };
}
