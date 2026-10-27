/**
 * Admin-panel rule: an order with 10 or more packages of eggs ("eggs", 15'li
 * paket) is delivered for free. Applies to hand delivery only — an order with
 * any cargo ("shipping") line keeps whatever fee it has.
 *
 * One pure function on purpose: the server writers (create / bulk / edit) and
 * the screens' previews all call it, so the fee a screen shows is the fee that
 * gets saved. Money is kuruş (CLAUDE.md §7).
 */
export const FREE_DELIVERY_EGG_PRODUCT_KEY = "eggs";
export const FREE_DELIVERY_MIN_EGG_PACKAGES = 10;

export interface FreeDeliveryLine {
  readonly product_key: string;
  readonly quantity: number;
  readonly fulfillment_type: "delivery" | "shipping";
}

export function eggPackageCount(lines: ReadonlyArray<FreeDeliveryLine>): number {
  let total = 0;
  for (const line of lines) {
    if (line.product_key === FREE_DELIVERY_EGG_PRODUCT_KEY) total += line.quantity;
  }
  return total;
}

export function qualifiesForFreeEggDelivery(
  lines: ReadonlyArray<FreeDeliveryLine>,
): boolean {
  if (lines.some((line) => line.fulfillment_type === "shipping")) return false;
  return eggPackageCount(lines) >= FREE_DELIVERY_MIN_EGG_PACKAGES;
}

/** The fee to store: 0 when the basket qualifies, otherwise the fee as given. */
export function applyFreeEggDelivery(
  feeMinor: number,
  lines: ReadonlyArray<FreeDeliveryLine>,
): number {
  return qualifiesForFreeEggDelivery(lines) ? 0 : feeMinor;
}
