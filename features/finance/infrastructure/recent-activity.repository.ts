/**
 * Bounded reads (limit per source, never a full aggregate) across three
 * money-adjacent tables for the "Son Finansal Hareketler" feed. Querying
 * order_payments/expenses/market_sales directly here — not through
 * features/orders — is data coupling via the shared schema, the same way
 * finance_revenue_by_channel's SQL reads `orders`/`customers` directly; it's
 * not a cross-feature *code* import, so it doesn't cross the boundaries rule
 * (CLAUDE.md §2 / eslint-plugin-boundaries — "infrastructure implements its
 * own domain", it doesn't forbid reading tables another feature also owns).
 */
import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { FinancialActivityItem } from "@/features/finance/domain/financial-activity";

const PER_SOURCE_LIMIT = 5;

export async function getRecentFinancialActivity(): Promise<
  Result<FinancialActivityItem[], ExternalApiError>
> {
  const supabase = await createSupabaseServerClient();

  const [paymentsRes, expensesRes, marketRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("order_payments")
      .select("id, amount_minor, paid_at, orders!inner(order_number)")
      .order("paid_at", { ascending: false })
      .limit(PER_SOURCE_LIMIT),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("expenses")
      .select("id, category, amount_minor, created_at, expense_categories(name)")
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE_LIMIT),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("market_sales")
      .select("id, total_amount_minor, created_at, market_locations!inner(name)")
      .order("created_at", { ascending: false })
      .limit(PER_SOURCE_LIMIT),
  ]);

  if (paymentsRes.error || expensesRes.error || marketRes.error) {
    const error = paymentsRes.error ?? expensesRes.error ?? marketRes.error;
    logger.error(
      { code: error.code, message: error.message },
      "get_recent_financial_activity_failed",
    );
    return err(new ExternalApiError({ message: "Son hareketler yüklenemedi.", cause: error }));
  }

  const items: FinancialActivityItem[] = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((paymentsRes.data ?? []) as any[]).map((row) => ({
      id: `payment-${row.id}`,
      kind: "order_payment" as const,
      description: `Ödeme alındı — Sipariş #${row.orders?.order_number ?? "—"}`,
      amountMinor: row.amount_minor,
      occurredAt: new Date(row.paid_at),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((expensesRes.data ?? []) as any[]).map((row) => ({
      id: `expense-${row.id}`,
      kind: "expense" as const,
      description: `Gider eklendi — ${row.expense_categories?.name ?? row.category ?? "—"}`,
      amountMinor: row.amount_minor,
      occurredAt: new Date(row.created_at),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((marketRes.data ?? []) as any[]).map((row) => ({
      id: `market-${row.id}`,
      kind: "market_sale" as const,
      description: `Pazar satışı kaydedildi — ${row.market_locations?.name ?? "—"}`,
      amountMinor: row.total_amount_minor,
      occurredAt: new Date(row.created_at),
    })),
  ];

  items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  return ok(items.slice(0, PER_SOURCE_LIMIT * 2));
}
