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

/** List-view projection — drops line items for table display. */
export interface MarketSaleListItem {
  readonly id: string;
  readonly location_id: string;
  readonly location_name: string;
  readonly sale_date: string;
  readonly total_amount_minor: number;
  readonly payment_method: ManualPaymentMethod;
  readonly item_count: number;
  readonly created_at: Date;
}
