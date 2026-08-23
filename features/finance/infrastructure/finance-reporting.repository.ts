/**
 * Thin wrappers around the finance_* SQL RPCs
 * (20260819210200_finance_reporting_rpcs.sql). All aggregation happens in
 * Postgres — see that migration's header comment for why (the admin grid's
 * GRID_PAGE_SIZE=2000 is a display cap, not an aggregation license; summing
 * fetched rows in TS would silently under-report past it).
 *
 * `(supabase as any).rpc(...)` follows the existing un-generated-RPC pattern
 * (features/orders/infrastructure/order.repository.ts) — these functions
 * won't appear in shared/supabase/types.ts until `pnpm db:types` is run
 * against the linked project.
 */
import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { FinanceChannel } from "@/features/finance/domain/finance-channel";
import type { FinanceDateBasis } from "@/features/finance/domain/finance-summary";

export interface RevenueByChannelRow {
  channel: FinanceChannel;
  revenue_minor: number;
  order_count: number;
}

export interface MarketRevenueRow {
  location_id: string;
  location_name: string;
  revenue_minor: number;
  sale_count: number;
}

export interface CollectedAmountRow {
  orders_minor: number;
  market_minor: number;
}

export interface ExpenseSummaryRow {
  total_minor: number;
  paid_minor: number;
  pending_minor: number;
}

/** Leaf-level row from finance_expense_category_breakdown — parent_id/name
 *  are null for a top-level category with no parent. The app layer sums by
 *  `parent_id ?? category_id` for the Ana Kategoriler view (spec §18). */
export interface ExpenseCategoryBreakdownRow {
  category_id: string;
  category_name: string;
  parent_id: string | null;
  parent_name: string | null;
  amount_minor: number;
}

export interface MarketTopProductRow {
  product_key: string;
  product_name: string;
  total_quantity: number;
}

function rpcFailure(rpcName: string, error: { code?: string; message: string }) {
  logger.error({ rpc: rpcName, code: error.code, message: error.message }, "finance_rpc_failed");
  return err(new ExternalApiError({ message: "Finans verisi alınamadı.", cause: error }));
}

export async function financeRevenueByChannel(
  from: string,
  to: string,
  dateBasis: FinanceDateBasis,
): Promise<Result<RevenueByChannelRow[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("finance_revenue_by_channel", {
    p_from: from,
    p_to: to,
    p_date_basis: dateBasis,
  });
  if (error) return rpcFailure("finance_revenue_by_channel", error);
  return ok((data ?? []) as RevenueByChannelRow[]);
}

export async function financeMarketRevenue(
  from: string,
  to: string,
): Promise<Result<MarketRevenueRow[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("finance_market_revenue", {
    p_from: from,
    p_to: to,
  });
  if (error) return rpcFailure("finance_market_revenue", error);
  return ok((data ?? []) as MarketRevenueRow[]);
}

export async function financeCollectedAmount(
  from: string,
  to: string,
): Promise<Result<CollectedAmountRow, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("finance_collected_amount", {
    p_from: from,
    p_to: to,
  });
  if (error) return rpcFailure("finance_collected_amount", error);
  const row = (data ?? [])[0] as CollectedAmountRow | undefined;
  return ok(row ?? { orders_minor: 0, market_minor: 0 });
}

export async function financeExpectedPayments(
  from: string,
  to: string,
  dateBasis: FinanceDateBasis,
): Promise<Result<number, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("finance_expected_payments", {
    p_from: from,
    p_to: to,
    p_date_basis: dateBasis,
  });
  if (error) return rpcFailure("finance_expected_payments", error);
  return ok(Number(data ?? 0));
}

export async function financeExpenseSummary(
  from: string,
  to: string,
): Promise<Result<ExpenseSummaryRow, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("finance_expense_summary", {
    p_from: from,
    p_to: to,
  });
  if (error) return rpcFailure("finance_expense_summary", error);
  const row = (data ?? [])[0] as ExpenseSummaryRow | undefined;
  return ok(row ?? { total_minor: 0, paid_minor: 0, pending_minor: 0 });
}

export async function financeExpenseCategoryBreakdown(
  from: string,
  to: string,
): Promise<Result<ExpenseCategoryBreakdownRow[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("finance_expense_category_breakdown", {
    p_from: from,
    p_to: to,
  });
  if (error) return rpcFailure("finance_expense_category_breakdown", error);
  return ok((data ?? []) as ExpenseCategoryBreakdownRow[]);
}

export async function financeMarketTopProducts(
  from: string,
  to: string,
  limit = 10,
): Promise<Result<MarketTopProductRow[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("finance_market_top_products", {
    p_from: from,
    p_to: to,
    p_limit: limit,
  });
  if (error) return rpcFailure("finance_market_top_products", error);
  return ok((data ?? []) as MarketTopProductRow[]);
}
