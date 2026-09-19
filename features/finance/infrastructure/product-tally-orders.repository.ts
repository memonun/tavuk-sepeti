import "server-only";

/**
 * Orders containing one product, for the Ürün Çetelesi drill-down. Read
 * straight off orders + the child table (no RPC → no migration to apply), with
 * RLS doing the admin gating exactly as it does for product_tally().
 *
 * Queried FROM `orders` with an inner-joined child filter rather than from
 * order_items: pagination and ordering then act on orders (one row per order,
 * newest delivery first), which is what the list shows.
 *
 * Period bounds mirror the Finans RPCs: `scheduled_for` is a date column;
 * `created_at` is a timestamptz compared against Europe/Istanbul midnights
 * (fixed +03:00, no DST since 2016 — shared/utils/date.ts).
 */
import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { addDaysToYmd } from "@/shared/utils/date";

import type { FinanceDateBasis } from "@/features/finance/domain/finance-summary";
import {
  customerNameOf,
  pageCountFor,
  PRODUCT_ORDERS_PAGE_SIZE,
  type ProductOrderRow,
  type ProductOrdersKind,
  type ProductOrdersPage,
} from "@/features/finance/domain/product-tally-orders";

export interface FetchProductOrdersInput {
  productKey: string;
  kind: ProductOrdersKind;
  from: string;
  to: string;
  dateBasis: FinanceDateBasis;
  page: number;
}

interface SoldItem {
  quantity: number | string;
  line_total_minor: number | string | null;
}
interface GiftItem {
  quantity: number | string;
  unit_label: string;
  note: string | null;
}
interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  scheduled_for: string;
  created_at: string;
  customers: { first_name?: unknown; last_name?: unknown } | null;
  order_items?: SoldItem[];
  order_gift_items?: GiftItem[];
}

const ORDER_COLUMNS =
  "id, order_number, status, scheduled_for, created_at, customers!inner(first_name, last_name)";

function toRow(order: OrderRow, kind: ProductOrdersKind): ProductOrderRow {
  const base = {
    order_id: order.id,
    order_number: order.order_number,
    customer_name: customerNameOf(order.customers),
    status: order.status,
    scheduled_for: order.scheduled_for,
    created_at: order.created_at,
  };

  if (kind === "sold") {
    const items = order.order_items ?? [];
    return {
      ...base,
      quantity: items.reduce((sum, i) => sum + Number(i.quantity), 0),
      gift_unit_label: null,
      line_total_minor: items.reduce((sum, i) => sum + Number(i.line_total_minor ?? 0), 0),
      note: null,
    };
  }

  const gifts = order.order_gift_items ?? [];
  return {
    ...base,
    // A gift is recorded in its own unit; two gifts of one product in one order
    // are summed only when they share it, otherwise the first unit is shown and
    // the rest are listed in the note — never silently adding grams to pieces.
    quantity: gifts
      .filter((g) => g.unit_label === gifts[0]?.unit_label)
      .reduce((sum, g) => sum + Number(g.quantity), 0),
    gift_unit_label: gifts[0]?.unit_label ?? null,
    line_total_minor: null,
    note:
      [
        ...gifts
          .filter((g) => g.unit_label !== gifts[0]?.unit_label)
          .map((g) => `+ ${Number(g.quantity)} ${g.unit_label}`),
        ...gifts.map((g) => g.note).filter((n): n is string => !!n),
      ].join(" · ") || null,
  };
}

async function runQuery(input: FetchProductOrdersInput, page: number) {
  const supabase = await createSupabaseServerClient();
  const child = input.kind === "sold" ? "order_items" : "order_gift_items";
  const childColumns =
    input.kind === "sold" ? "quantity, line_total_minor" : "quantity, unit_label, note";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("orders")
    .select(`${ORDER_COLUMNS}, ${child}!inner(${childColumns})`, { count: "exact" })
    .eq(`${child}.product_key`, input.productKey)
    .neq("status", "cancelled");

  query =
    input.dateBasis === "created_at"
      ? query
          .gte("created_at", `${input.from}T00:00:00+03:00`)
          .lt("created_at", `${addDaysToYmd(input.to, 1)}T00:00:00+03:00`)
      : query.gte("scheduled_for", input.from).lte("scheduled_for", input.to);

  const start = (page - 1) * PRODUCT_ORDERS_PAGE_SIZE;
  return query
    .order("scheduled_for", { ascending: false })
    .order("created_at", { ascending: false })
    .range(start, start + PRODUCT_ORDERS_PAGE_SIZE - 1);
}

export async function fetchProductOrders(
  input: FetchProductOrdersInput,
): Promise<Result<ProductOrdersPage, ExternalApiError>> {
  let page = input.page;
  let { data, error, count } = await runQuery(input, page);

  // A stale ?orders_page (e.g. the period was narrowed) lands past the end:
  // fall back to the last real page instead of an empty list.
  if (!error && (data ?? []).length === 0 && (count ?? 0) > 0 && page > 1) {
    page = pageCountFor(count ?? 0);
    ({ data, error, count } = await runQuery(input, page));
  }

  if (error) {
    logger.error(
      { productKey: input.productKey, kind: input.kind, code: error.code, message: error.message },
      "product_tally_orders_query_failed",
    );
    return err(new ExternalApiError({ message: "Sipariş listesi alınamadı.", cause: error }));
  }

  const total = count ?? 0;
  return ok({
    rows: ((data ?? []) as OrderRow[]).map((o) => toRow(o, input.kind)),
    total,
    page,
    pageCount: pageCountFor(total),
  });
}
