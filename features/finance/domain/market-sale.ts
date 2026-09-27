/**
 * A recorded sale at one of the physical market stalls. `total_amount_minor`
 * is entered directly by the admin at time of sale (a quick tally) — line
 * items exist purely for "which products sold" reporting and are not
 * required to reconcile against the total.
 */
import type { ManualPaymentMethod } from "@/features/finance/domain/expense";

export interface MarketSaleItem {
  readonly id: string;
  readonly product_key: string;
  readonly product_name: string;
  readonly quantity: number;
  /** products.unit_label / products.unit — for showing "20 paket". */
  readonly unit_label: string;
  readonly unit: string;
  /** Price (kuruş) this item actually sold at — 0 on a row recorded before
   *  2026-09-27 (per-item pricing didn't exist yet). */
  readonly unit_price_minor: number;
  readonly line_total_minor: number;
}

export interface MarketSale {
  readonly id: string;
  readonly location_id: string;
  readonly location_name: string;
  readonly sale_date: string; // YYYY-MM-DD
  readonly total_amount_minor: number;
  readonly payment_method: ManualPaymentMethod;
  readonly note: string | null;
  readonly items: readonly MarketSaleItem[];
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly created_by: string | null;
}

/** List-view projection — line items are kept (name/quantity/unit only) so the
 *  table can show WHAT was sold without opening each sale. */
export interface MarketSaleListItem {
  readonly id: string;
  readonly location_id: string;
  readonly location_name: string;
  readonly sale_date: string;
  readonly total_amount_minor: number;
  readonly payment_method: ManualPaymentMethod;
  readonly items: readonly MarketSaleItem[];
  readonly created_at: Date;
}
