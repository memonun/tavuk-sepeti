/**
 * Persistence layer for expenses. Plain paginated list + CRUD — a new,
 * smaller-scale table, so default/max pagination follows CLAUDE.md §9
 * (25/100) rather than the orders/customers GRID_PAGE_SIZE override.
 */
import "server-only";

import { ExternalApiError, NotFoundError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { Expense } from "@/features/finance/domain/expense";
import type { ExpenseListQuery } from "@/features/finance/domain/expense.schema";

const EXPENSE_SELECT =
  "id, category, amount_minor, expense_date, description, payment_status, payment_method, vendor, note, created_at, updated_at, created_by" as const;

type ExpenseRow = {
  id: string;
  category: string;
  amount_minor: number;
  expense_date: string;
  description: string | null;
  payment_status: Expense["payment_status"];
  payment_method: Expense["payment_method"];
  vendor: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

function rowToExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    category: row.category,
    amount_minor: row.amount_minor,
    expense_date: row.expense_date,
    description: row.description,
    payment_status: row.payment_status,
    payment_method: row.payment_method,
    vendor: row.vendor,
    note: row.note,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    created_by: row.created_by,
  };
}

export interface ListExpensesResult {
  items: Expense[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listExpenses(
  query: ExpenseListQuery,
): Promise<Result<ListExpensesResult, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let builder = (supabase as any)
    .from("expenses")
    .select(EXPENSE_SELECT, { count: "exact" });

  if (query.category) builder = builder.eq("category", query.category);
  if (query.payment_status) builder = builder.eq("payment_status", query.payment_status);
  if (query.date_from) builder = builder.gte("expense_date", query.date_from);
  if (query.date_to) builder = builder.lte("expense_date", query.date_to);
  if (query.q) {
    const escaped = query.q.replace(/[\\%_]/g, (c) => `\\${c}`);
    builder = builder.or(
      `description.ilike.%${escaped}%,vendor.ilike.%${escaped}%,note.ilike.%${escaped}%`,
    );
  }

  builder = builder.order(query.sort, { ascending: query.order === "asc" }).range(from, to);

  const { data, error, count } = await builder;
  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_expenses_failed");
    return err(new ExternalApiError({ message: "Giderler yüklenemedi.", cause: error }));
  }

  return ok({
    items: ((data ?? []) as ExpenseRow[]).map(rowToExpense),
    total: count ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  });
}

export async function findExpenseById(
  id: string,
): Promise<Result<Expense, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("expenses")
    .select(EXPENSE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logger.error({ code: error.code, message: error.message }, "find_expense_failed");
    return err(new ExternalApiError({ message: "Gider yüklenemedi.", cause: error }));
  }
  if (!data) return err(new NotFoundError({ message: "Gider bulunamadı." }));
  return ok(rowToExpense(data as ExpenseRow));
}

export interface ExpenseWriteInput {
  category: string;
  amount_minor: number;
  expense_date: string;
  description: string | null;
  payment_status: Expense["payment_status"];
  payment_method: Expense["payment_method"];
  vendor: string | null;
  note: string | null;
  created_by: string;
}

export async function createExpense(
  input: ExpenseWriteInput,
): Promise<Result<string, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("expenses")
    .insert({
      category: input.category,
      amount_minor: input.amount_minor,
      expense_date: input.expense_date,
      description: input.description,
      payment_status: input.payment_status,
      payment_method: input.payment_method,
      vendor: input.vendor,
      note: input.note,
      created_by: input.created_by,
    })
    .select("id")
    .single();

  if (error) {
    logger.error({ code: error.code, message: error.message }, "create_expense_failed");
    return err(new ExternalApiError({ message: "Gider eklenemedi.", cause: error }));
  }
  return ok((data as { id: string }).id);
}

export async function updateExpense(
  id: string,
  input: Omit<ExpenseWriteInput, "created_by">,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("expenses")
    .update({
      category: input.category,
      amount_minor: input.amount_minor,
      expense_date: input.expense_date,
      description: input.description,
      payment_status: input.payment_status,
      payment_method: input.payment_method,
      vendor: input.vendor,
      note: input.note,
    })
    .eq("id", id);

  if (error) {
    logger.error({ code: error.code, message: error.message }, "update_expense_failed");
    return err(new ExternalApiError({ message: "Gider güncellenemedi.", cause: error }));
  }
  return ok(undefined);
}

export async function deleteExpense(id: string): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("expenses").delete().eq("id", id);
  if (error) {
    logger.error({ code: error.code, message: error.message }, "delete_expense_failed");
    return err(new ExternalApiError({ message: "Gider silinemedi.", cause: error }));
  }
  return ok(undefined);
}

export async function markExpensePaid(
  id: string,
  paymentMethod: Expense["payment_method"],
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("expenses")
    .update({ payment_status: "paid", payment_method: paymentMethod })
    .eq("id", id);
  if (error) {
    logger.error({ code: error.code, message: error.message }, "mark_expense_paid_failed");
    return err(new ExternalApiError({ message: "Gider ödendi olarak işaretlenemedi.", cause: error }));
  }
  return ok(undefined);
}
