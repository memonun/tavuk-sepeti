/**
 * Pure pricing for an order line — the single source of truth shared by the
 * order form (client preview) and the server (enrichOrderItems).
 *
 * Volume tiers: a product's price-per-unit can drop as quantity grows. A tier
 * applies for quantity in [min_qty, next tier's min_qty); we pick the highest
 * tier whose `min_qty <= quantity`. Products with no tiers fall back to the
 * flat base price (`current_unit_price_minor`).
 *
 * The tier rate is in kuruş and MAY be fractional — e.g. eggs at qty 3 price
 * at 11666.6667 kuruş/pkg so the line is exactly ₺350.00. The LINE TOTAL is
 * the authoritative figure: `round(quantity × rate)` once, to whole kuruş.
 * `unit_price_minor` is the rounded per-unit value kept for the record /
 * display (so unit × qty may differ from the stored line total by a kuruş —
 * the line total wins, by design).
 *
 * Decimal, not float: rates come from a numeric(12,4) column (CLAUDE.md §7).
 */
export interface ProductPriceTier {
  /** Tier applies when quantity >= this threshold. */
  readonly min_qty: number;
  /** Per-unit price in kuruş; may be fractional. */
  readonly unit_price_minor: number;
}

export interface LinePricingInput {
  readonly tiers: readonly ProductPriceTier[];
  /** Flat/base price in kuruş — used when no tier matches the quantity. */
  readonly basePriceMinor: number;
  /**
   * Per-customer special price (kuruş). When set, the line is flat at this
   * rate and the volume tiers are ignored entirely.
   */
  readonly overrideUnitPriceMinor?: number | undefined;
}

export interface LinePrice {
  /** Rounded per-unit price (whole kuruş) — for the record / display. */
  readonly unit_price_minor: number;
  /** Authoritative exact line total (whole kuruş). */
  readonly line_total_minor: number;
}

/** Resolve the per-unit rate (possibly fractional kuruş) for a quantity. */
export function rateForQuantity(
  quantity: number,
  { tiers, basePriceMinor }: LinePricingInput,
): number {
  let rate = basePriceMinor;
  let bestMin = -Infinity;
  for (const tier of tiers) {
    if (quantity >= tier.min_qty && tier.min_qty > bestMin) {
      bestMin = tier.min_qty;
      rate = tier.unit_price_minor;
    }
  }
  return rate;
}

/** Price one order line: exact line total + a rounded unit price. A
 *  customer special price (overrideUnitPriceMinor), when set, wins over tiers. */
export function priceOrderLine(
  quantity: number,
  input: LinePricingInput,
): LinePrice {
  const rate =
    input.overrideUnitPriceMinor != null
      ? input.overrideUnitPriceMinor
      : rateForQuantity(quantity, input);
  return {
    unit_price_minor: Math.round(rate),
    line_total_minor: Math.round(quantity * rate),
  };
}
