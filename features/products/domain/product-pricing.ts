/**
 * Pure pricing for an order line — the single source of truth shared by the
 * order form (client preview) and the server (enrichOrderItems).
 *
 * Volume tiers are GRADUATED: a tier with `min_qty = m` prices the m-th unit
 * and every unit after it, until the next tier takes over. Units before the
 * first tier use the flat base price (`current_unit_price_minor`). Products
 * with no tiers are flat-priced.
 *
 *   eggs: 1 → ₺130, 2 → ₺120, 3 → ₺100
 *   1 pkg = 130, 2 = 250, 3 = 350, 4 = 450, 5 = 550 …
 *
 * Quantities may be fractional (0.5 kg steps), so a tier covers the quantity
 * range above `m − 1`. The LINE TOTAL is the authoritative figure, rounded
 * once to whole kuruş. `unit_price_minor` is the rounded average per unit,
 * kept for the record / display (unit × qty may differ from the line total —
 * the line total wins, by design).
 *
 * Decimal, not float: rates come from a numeric(12,4) column (CLAUDE.md §7).
 */
export interface ProductPriceTier {
  /** This tier prices the min_qty-th unit onward. */
  readonly min_qty: number;
  /** Per-unit price in kuruş; may be fractional. */
  readonly unit_price_minor: number;
}

export interface LinePricingInput {
  readonly tiers: readonly ProductPriceTier[];
  /** Flat/base price in kuruş — for units before the first tier. */
  readonly basePriceMinor: number;
  /**
   * Per-customer special price (kuruş). When set, the line is flat at this
   * rate and the volume tiers are ignored entirely.
   */
  readonly overrideUnitPriceMinor?: number | undefined;
}

export interface LinePrice {
  /** Rounded average per-unit price (whole kuruş) — for the record / display. */
  readonly unit_price_minor: number;
  /** Authoritative exact line total (whole kuruş). */
  readonly line_total_minor: number;
}

/** Unrounded graduated total (kuruş) for a quantity. */
function graduatedTotal(
  quantity: number,
  { tiers, basePriceMinor }: LinePricingInput,
): number {
  // Each tier's range starts at min_qty − 1; the base price covers [0, first start).
  const segments = [...tiers]
    .sort((a, b) => a.min_qty - b.min_qty)
    .map((t) => ({ start: Math.max(0, t.min_qty - 1), rate: t.unit_price_minor }));
  segments.unshift({ start: 0, rate: basePriceMinor });

  let total = 0;
  for (const [i, seg] of segments.entries()) {
    const end = Math.min(quantity, segments[i + 1]?.start ?? Infinity);
    if (end > seg.start) total += (end - seg.start) * seg.rate;
  }
  return total;
}

/** Price one order line: exact line total + a rounded average unit price. A
 *  customer special price (overrideUnitPriceMinor), when set, wins over tiers. */
export function priceOrderLine(
  quantity: number,
  input: LinePricingInput,
): LinePrice {
  if (input.overrideUnitPriceMinor != null) {
    return {
      unit_price_minor: Math.round(input.overrideUnitPriceMinor),
      line_total_minor: Math.round(quantity * input.overrideUnitPriceMinor),
    };
  }
  if (quantity <= 0) {
    return { unit_price_minor: Math.round(input.basePriceMinor), line_total_minor: 0 };
  }
  const total = graduatedTotal(quantity, input);
  return {
    unit_price_minor: Math.round(total / quantity),
    line_total_minor: Math.round(total),
  };
}
