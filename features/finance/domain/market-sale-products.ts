/**
 * Products sold at a market stall: the pure rules behind the sale form's
 * quantity+price sheet and the "what was sold" displays. No I/O, no framework
 * (domain may only import `shared` + its own folder — the tier-aware catalog
 * rate used to PREFILL a price box lives in the UI layer instead, which is
 * allowed to call the products feature's pricing helpers directly).
 *
 * Line items are informational for the sale's own total (see market-sale.ts:
 * `total_amount_minor` is still typed by the admin and need not equal the sum
 * of item lines — a stall day can go unitemized) — but once a product IS put
 * on the sheet with a quantity, its price is required: that is the whole point
 * of capturing it ("kaça sattık", not just "kaç tane sattık").
 */
import { parseTRYInput } from "@/shared/utils/money";

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

export type ParsedAmount =
  | { readonly kind: "empty" }
  | { readonly kind: "ok"; readonly value: number }
  | { readonly kind: "invalid" };

/** A price box (₺): blank = "not entered yet", 0 or more = that price (0 =
 *  given away), anything else is an error. */
export function parsePriceText(text: string): ParsedAmount {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "empty" };
  const minor = parseTRYInput(trimmed);
  return minor === null ? { kind: "invalid" } : { kind: "ok", value: minor };
}

export interface SoldLineItem {
  readonly product_key: string;
  readonly quantity: number;
  readonly unit_price_minor: number;
  readonly line_total_minor: number;
}

export type BuildItemsResult =
  | { readonly ok: true; readonly items: ReadonlyArray<SoldLineItem> }
  | {
      readonly ok: false;
      readonly productKey: string;
      readonly field: "quantity" | "price";
      /** "missing": the price box was left blank on a row that has a quantity.
       *  "invalid": the typed text isn't a valid amount/quantity. */
      readonly kind: "missing" | "invalid";
    };

/**
 * Turn the sheet's per-product quantity + price text into priced line items.
 * A row only exists once a quantity is typed; once it does, its price is
 * REQUIRED — the UI prefills it from the catalog rate the moment a quantity is
 * entered, so this is rarely a manual step, but a since-cleared price box is
 * refused rather than silently priced at ₺0. The first bad row (quantity OR
 * price) is named so the form can point at it.
 */
export function buildSaleItems(
  quantities: Readonly<Record<string, string>>,
  prices: Readonly<Record<string, string>>,
  orderedKeys: ReadonlyArray<string>,
): BuildItemsResult {
  const items: SoldLineItem[] = [];
  for (const key of orderedKeys) {
    const q = parseQuantityText(quantities[key] ?? "");
    if (q.kind === "empty") continue;
    if (q.kind === "invalid") {
      return { ok: false, productKey: key, field: "quantity", kind: "invalid" };
    }

    const p = parsePriceText(prices[key] ?? "");
    if (p.kind === "empty") {
      return { ok: false, productKey: key, field: "price", kind: "missing" };
    }
    if (p.kind === "invalid") {
      return { ok: false, productKey: key, field: "price", kind: "invalid" };
    }

    items.push({
      product_key: key,
      quantity: q.value,
      unit_price_minor: p.value,
      line_total_minor: Math.round(q.value * p.value),
    });
  }
  return { ok: true, items };
}

/**
 * Live/lenient variant for the running total while typing: silently skips a
 * row whose quantity OR price is blank/invalid instead of erroring, so a
 * half-typed "2," doesn't blank the whole summary mid-keystroke. Submitting
 * always goes through the strict `buildSaleItems`.
 */
export function collectSoldItems(
  quantities: Readonly<Record<string, string>>,
  prices: Readonly<Record<string, string>>,
  orderedKeys: ReadonlyArray<string>,
): SoldLineItem[] {
  const items: SoldLineItem[] = [];
  for (const key of orderedKeys) {
    const q = parseQuantityText(quantities[key] ?? "");
    if (q.kind !== "ok") continue;
    const p = parsePriceText(prices[key] ?? "");
    if (p.kind !== "ok") continue;
    items.push({
      product_key: key,
      quantity: q.value,
      unit_price_minor: p.value,
      line_total_minor: Math.round(q.value * p.value),
    });
  }
  return items;
}
