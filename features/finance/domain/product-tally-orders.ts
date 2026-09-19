/**
 * Ürün Çetelesi drill-down — which orders a product was sold (or gifted) in,
 * for the report's period. Same "real sale" rule as product_tally(): every
 * status except cancelled.
 *
 * Kept as its own small model rather than reusing the orders feature's list
 * item: the drill-down needs the product's per-order quantity, which an order
 * row does not carry, and finance must not reach into orders' internals
 * (CLAUDE.md §2).
 */
export const PRODUCT_ORDERS_PAGE_SIZE = 25;

export type ProductOrdersKind = "sold" | "gift";

export function parseProductOrdersKind(raw: string | undefined): ProductOrdersKind | null {
  return raw === "sold" || raw === "gift" ? raw : null;
}

/** 1-based page number from a query param; anything unusable becomes 1. */
export function parsePageParam(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export const ORDER_STATUS_LABEL: Readonly<Record<string, string>> = {
  pending: "Bekliyor",
  confirmed: "Onaylı",
  shipped: "Kargolandı",
  delivered: "Teslim",
  cancelled: "İptal",
};

export interface ProductOrderRow {
  readonly order_id: string;
  readonly order_number: string;
  readonly customer_name: string;
  readonly status: string;
  /** YYYY-MM-DD delivery day. */
  readonly scheduled_for: string;
  readonly created_at: string;
  /** This product's quantity in the order (summed if the product has two lines). */
  readonly quantity: number;
  /** Gift only: the unit the gift was recorded in ("gr", "adet"…). Sold rows
   *  use the product's own unit label, carried by the caller. */
  readonly gift_unit_label: string | null;
  /** Sold only: line total in kuruş. Null for gifts (unpriced). */
  readonly line_total_minor: number | null;
  /** Gift only: optional packing note. */
  readonly note: string | null;
}

export interface ProductOrdersPage {
  readonly rows: ReadonlyArray<ProductOrderRow>;
  readonly total: number;
  readonly page: number;
  readonly pageCount: number;
}

interface EmbeddedCustomer {
  first_name?: unknown;
  last_name?: unknown;
}

/** PostgREST returns a to-one embed as an object, but tolerate an array. */
export function customerNameOf(raw: EmbeddedCustomer | EmbeddedCustomer[] | null): string {
  const c = Array.isArray(raw) ? raw[0] : raw;
  const parts = [c?.first_name, c?.last_name].filter(
    (p): p is string => typeof p === "string" && p.trim() !== "",
  );
  return parts.join(" ") || "—";
}

export function pageCountFor(total: number): number {
  return Math.max(1, Math.ceil(total / PRODUCT_ORDERS_PAGE_SIZE));
}
