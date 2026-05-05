/**
 * Product — fixed Faz 1 catalog. Mirrors migration 003's `products` table.
 *
 * `key` is a permanent string identifier (eggs / milk / cheese / yogurt) —
 * never change once shipped (FK from order_items, public contract).
 * `step` drives the quantity rule enforced in the orders domain:
 * `quantity % step === 0`. cheese/yogurt are sold in 0.5 kg increments.
 */
export type ProductUnit = "package" | "liter" | "kilogram" | "piece";

export interface Product {
  readonly key: string;
  readonly display_name: string;
  readonly unit: ProductUnit;
  readonly unit_label: string;
  readonly package_size: number;
  readonly min_qty: number;
  readonly step: number;
  readonly current_unit_price_minor: number;
  readonly active: boolean;
}
