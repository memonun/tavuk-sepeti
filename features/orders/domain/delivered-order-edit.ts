/**
 * Editing a delivered order keeps what was charged (owner decision, 2026-10-28).
 *
 * A pending/confirmed order re-prices every line at current pricing. A
 * delivered order is a record of a sale, so a line the edit leaves alone —
 * same product, same quantity, price field untouched — keeps its stored unit
 * price, line total and snapshot. Only new lines, changed quantities, or a
 * deliberately typed price are priced afresh.
 *
 * "Price field untouched" accepts the three values an unchanged line can carry:
 * nothing (the connector), the stored unit price (copied from get_order), or
 * the customer's current special price (what the panel pre-fills).
 *
 * Pure: the server uses it to save and the panel uses it for its live total,
 * so the preview always matches the saved order.
 */
import type { OrderItem } from "@/features/orders/domain/order";

export type StoredLine = Pick<
  OrderItem,
  "product_key" | "quantity" | "unit_price_minor" | "line_total_minor" | "product_snapshot" | "fulfillment_type"
>;

export type DeliveredEditLine<L> =
  | { readonly kind: "kept"; readonly stored: StoredLine }
  | { readonly kind: "priced"; readonly line: L };

/** Quantities are at most 2 decimals; compare scaled so 0.1 + 0.2 never bites. */
function sameQuantity(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

export function splitDeliveredEdit<
  L extends { product_key: string; quantity: number; unit_price_minor?: number | undefined },
>(
  lines: readonly L[],
  stored: readonly StoredLine[],
  customerPrices: Readonly<Record<string, number>>,
): DeliveredEditLine<L>[] {
  const unused = [...stored];
  return lines.map((line) => {
    const index = unused.findIndex(
      (s) =>
        s.product_key === line.product_key &&
        sameQuantity(s.quantity, line.quantity) &&
        (line.unit_price_minor === undefined ||
          line.unit_price_minor === s.unit_price_minor ||
          line.unit_price_minor === customerPrices[line.product_key]),
    );
    if (index === -1) return { kind: "priced", line };
    const [match] = unused.splice(index, 1);
    // findIndex found it, so splice returned it.
    return { kind: "kept", stored: match as StoredLine };
  });
}
