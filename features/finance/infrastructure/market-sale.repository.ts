/**
 * Persistence layer for market_sales + market_sale_items. Sequential
 * inserts (sale header first, line items second) with orphan cleanup if the
 * items insert fails — same low-concurrency-admin-write reasoning as
 * features/customers/infrastructure/customer.repository.ts (customer +
 * address): an RPC wrapping both in one transaction is overkill for this
 * write volume.
 */
import "server-only";

import { ExternalApiError, NotFoundError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { MarketSale, MarketSaleListItem } from "@/features/finance/domain/market-sale";
import type { MarketSaleItemInput, MarketSaleListQuery } from "@/features/finance/domain/market-sale.schema";

const SALE_LIST_SELECT =
  "id, location_id, sale_date, total_amount_minor, payment_method, created_at, market_locations!inner(name), market_sale_items(id)" as const;

const SALE_DETAIL_SELECT =
  "id, location_id, sale_date, total_amount_minor, payment_method, note, created_at, updated_at, created_by, market_locations!inner(name), market_sale_items(id, product_key, quantity, products(display_name))" as const;

interface SaleListRow {
  id: string;
  location_id: string;
  sale_date: string;
  total_amount_minor: number;
  payment_method: MarketSaleListItem["payment_method"];
  created_at: string;
  market_locations: { name: string } | null;
  market_sale_items: unknown[] | null;
}

interface SaleDetailRow {
  id: string;
  location_id: string;
  sale_date: string;
  total_amount_minor: number;
  payment_method: MarketSale["payment_method"];
  note: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  market_locations: { name: string } | null;
  market_sale_items: Array<{
    id: string;
    product_key: string;
    quantity: number;
    products: { display_name: string } | null;
  }> | null;
}

function rowToListItem(row: SaleListRow): MarketSaleListItem {
  return {
    id: row.id,
    location_id: row.location_id,
    location_name: row.market_locations?.name ?? "—",
    sale_date: row.sale_date,
    total_amount_minor: row.total_amount_minor,
    payment_method: row.payment_method,
    item_count: Array.isArray(row.market_sale_items) ? row.market_sale_items.length : 0,
    created_at: new Date(row.created_at),
  };
}

function rowToSale(row: SaleDetailRow): MarketSale {
  return {
    id: row.id,
    location_id: row.location_id,
    location_name: row.market_locations?.name ?? "—",
    sale_date: row.sale_date,
    total_amount_minor: row.total_amount_minor,
    payment_method: row.payment_method,
    note: row.note,
    items: (row.market_sale_items ?? []).map((item) => ({
      id: item.id,
      product_key: item.product_key,
      product_name: item.products?.display_name ?? item.product_key,
      quantity: item.quantity,
    })),
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    created_by: row.created_by,
  };
}

export interface ListMarketSalesResult {
  items: MarketSaleListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listMarketSales(
  query: MarketSaleListQuery,
): Promise<Result<ListMarketSalesResult, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let builder = (supabase as any)
    .from("market_sales")
    .select(SALE_LIST_SELECT, { count: "exact" });

  if (query.location_id) builder = builder.eq("location_id", query.location_id);
  if (query.date_from) builder = builder.gte("sale_date", query.date_from);
  if (query.date_to) builder = builder.lte("sale_date", query.date_to);

  builder = builder.order(query.sort, { ascending: query.order === "asc" }).range(from, to);

  const { data, error, count } = await builder;
  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_market_sales_failed");
    return err(new ExternalApiError({ message: "Pazar satışları yüklenemedi.", cause: error }));
  }

  return ok({
    items: ((data ?? []) as SaleListRow[]).map(rowToListItem),
    total: count ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  });
}

export async function findMarketSaleById(
  id: string,
): Promise<Result<MarketSale, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("market_sales")
    .select(SALE_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logger.error({ code: error.code, message: error.message }, "find_market_sale_failed");
    return err(new ExternalApiError({ message: "Pazar satışı yüklenemedi.", cause: error }));
  }
  if (!data) return err(new NotFoundError({ message: "Pazar satışı bulunamadı." }));
  return ok(rowToSale(data as SaleDetailRow));
}

export interface MarketSaleWriteInput {
  location_id: string;
  sale_date: string;
  total_amount_minor: number;
  payment_method: string;
  note: string | null;
  items: MarketSaleItemInput[];
  created_by: string;
}

export async function createMarketSale(
  input: MarketSaleWriteInput,
): Promise<Result<string, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sale, error: saleError } = await (supabase as any)
    .from("market_sales")
    .insert({
      location_id: input.location_id,
      sale_date: input.sale_date,
      total_amount_minor: input.total_amount_minor,
      payment_method: input.payment_method,
      note: input.note,
      created_by: input.created_by,
    })
    .select("id")
    .single();

  if (saleError) {
    logger.error({ code: saleError.code, message: saleError.message }, "create_market_sale_failed");
    return err(new ExternalApiError({ message: "Pazar satışı eklenemedi.", cause: saleError }));
  }

  const saleId = (sale as { id: string }).id;
  if (input.items.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: itemsError } = await (supabase as any).from("market_sale_items").insert(
      input.items.map((item) => ({
        sale_id: saleId,
        product_key: item.product_key,
        quantity: item.quantity,
      })),
    );
    if (itemsError) {
      logger.error(
        { code: itemsError.code, message: itemsError.message },
        "create_market_sale_items_failed",
      );
      // Orphan cleanup — the header without its items is worse than nothing.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("market_sales").delete().eq("id", saleId);
      return err(new ExternalApiError({ message: "Satılan ürünler kaydedilemedi.", cause: itemsError }));
    }
  }

  return ok(saleId);
}

export async function updateMarketSale(
  id: string,
  input: Omit<MarketSaleWriteInput, "created_by">,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: saleError } = await (supabase as any)
    .from("market_sales")
    .update({
      location_id: input.location_id,
      sale_date: input.sale_date,
      total_amount_minor: input.total_amount_minor,
      payment_method: input.payment_method,
      note: input.note,
    })
    .eq("id", id);

  if (saleError) {
    logger.error({ code: saleError.code, message: saleError.message }, "update_market_sale_failed");
    return err(new ExternalApiError({ message: "Pazar satışı güncellenemedi.", cause: saleError }));
  }

  // Replace line items wholesale — simplest correct approach for a small,
  // admin-entered list (max 50 items, CLAUDE.md §9 N+1 concern doesn't apply
  // at this scale).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: deleteError } = await (supabase as any)
    .from("market_sale_items")
    .delete()
    .eq("sale_id", id);
  if (deleteError) {
    logger.error(
      { code: deleteError.code, message: deleteError.message },
      "update_market_sale_items_clear_failed",
    );
    return err(new ExternalApiError({ message: "Satılan ürünler güncellenemedi.", cause: deleteError }));
  }

  if (input.items.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: itemsError } = await (supabase as any).from("market_sale_items").insert(
      input.items.map((item) => ({
        sale_id: id,
        product_key: item.product_key,
        quantity: item.quantity,
      })),
    );
    if (itemsError) {
      logger.error(
        { code: itemsError.code, message: itemsError.message },
        "update_market_sale_items_insert_failed",
      );
      return err(new ExternalApiError({ message: "Satılan ürünler güncellenemedi.", cause: itemsError }));
    }
  }

  return ok(undefined);
}

export async function deleteMarketSale(id: string): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // market_sale_items cascades (on delete cascade, 20260819210100).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("market_sales").delete().eq("id", id);
  if (error) {
    logger.error({ code: error.code, message: error.message }, "delete_market_sale_failed");
    return err(new ExternalApiError({ message: "Pazar satışı silinemedi.", cause: error }));
  }
  return ok(undefined);
}
