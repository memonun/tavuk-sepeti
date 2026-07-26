/**
 * Pure cart quantity math for the storefront.
 *
 * The cart holds only { product_key, quantity } — pricing is resolved in the
 * UI from the products catalog (single source of truth: the products feature's
 * pricing engine), and re-validated + re-priced server-side at checkout. This
 * module is pure and client-safe: no pricing, no product catalog, no I/O.
 *
 * Quantities honour each product's `step` (cheese/yogurt sell in 0.5 kg
 * increments, SPEC.md §3.2) and `min_qty`. Scaled-integer math (×100) avoids
 * float drift when adding 0.5 repeatedly.
 */

export interface CartLine {
  readonly product_key: string;
  readonly quantity: number;
}

const SCALE = 100;

const round2 = (n: number): number => Math.round(n * SCALE) / SCALE;

/** True when `quantity` is an exact integer multiple of `step`. */
export function isMultipleOfStep(quantity: number, step: number): boolean {
  if (step <= 0) return false;
  return Math.round(quantity * SCALE) % Math.round(step * SCALE) === 0;
}

/** True when a quantity is a legal order amount for a product. */
export function isValidQuantity(
  quantity: number,
  min: number,
  step: number,
): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0) return false;
  if (quantity < min) return false;
  return isMultipleOfStep(quantity, step);
}

/** Snap an arbitrary quantity up to the nearest valid step at/above `min`. */
export function clampQuantity(
  quantity: number,
  min: number,
  step: number,
): number {
  if (!Number.isFinite(quantity) || quantity < min) return round2(min);
  const steps = Math.round((quantity - min) / step);
  return round2(min + steps * step);
}

/** One step up. */
export function incrementQuantity(quantity: number, step: number): number {
  return round2(quantity + step);
}

/** One step down, floored at `min`. */
export function decrementQuantity(
  quantity: number,
  min: number,
  step: number,
): number {
  return round2(Math.max(min, quantity - step));
}

/** Total distinct line count (for the cart badge). */
export function cartLineCount(lines: readonly CartLine[]): number {
  return lines.length;
}

/** Sum of pre-resolved line totals (kuruş). Pricing is computed by the caller
 *  from the catalog; this just adds without float drift. */
export function cartSubtotalMinor(lineTotalsMinor: readonly number[]): number {
  return lineTotalsMinor.reduce((acc, n) => acc + n, 0);
}
