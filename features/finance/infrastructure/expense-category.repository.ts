/**
 * Persistence layer for expense_categories. Table postdates the last
 * Supabase type generation, so every query goes through the `(supabase as
 * any)` cast — same convention as expense.repository.ts / market-location.repository.ts.
 */
import "server-only";

import { AppError, ExternalApiError, NotFoundError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { ExpenseCategory } from "@/features/finance/domain/expense-category";

/** expense_categories_enforce_depth_trigger's raised message contains this
 *  phrase when a child category is used as a parent (max two levels) —
 *  matched here to turn it into a BUSINESS_RULE_VIOLATION instead of a
 *  generic DB error. No delete function exists: spec only asks for
 *  archive/"Pasife Al", and expenses.category_id is `on delete restrict`
 *  anyway. */
const DEPTH_VIOLATION_MESSAGE = "max two levels";

type ExpenseCategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  system_key: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function rowToCategory(row: ExpenseCategoryRow): ExpenseCategory {
  return {
    id: row.id,
    name: row.name,
    parent_id: row.parent_id,
    system_key: row.system_key,
    active: row.active,
    sort_order: row.sort_order,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

const CATEGORY_SELECT =
  "id, name, parent_id, system_key, active, sort_order, created_at, updated_at" as const;

/** Always returns every category (active + archived) — historical expenses
 *  need archived categories' names, and the management UI needs to show
 *  them too (with a Pasife/Aktifleştir toggle). Callers that only want
 *  categories usable on a NEW expense should filter with
 *  features/finance/domain/expense-category.ts's activeCategoryNodes. */
export async function listExpenseCategories(): Promise<
  Result<ExpenseCategory[], ExternalApiError>
> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("expense_categories")
    .select(CATEGORY_SELECT)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_expense_categories_failed");
    return err(new ExternalApiError({ message: "Kategoriler yüklenemedi.", cause: error }));
  }
  return ok(((data ?? []) as ExpenseCategoryRow[]).map(rowToCategory));
}

export interface CreateExpenseCategoryInput {
  name: string;
  parent_id: string | null;
  sort_order: number;
}

export async function createExpenseCategory(
  input: CreateExpenseCategoryInput,
): Promise<Result<ExpenseCategory, AppError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("expense_categories")
    .insert({ name: input.name, parent_id: input.parent_id, sort_order: input.sort_order })
    .select(CATEGORY_SELECT)
    .single();

  if (error) {
    if (typeof error.message === "string" && error.message.includes(DEPTH_VIOLATION_MESSAGE)) {
      return err(
        new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, {
          message: "Bir alt kategori, başka bir kategorinin üst kategorisi olamaz (en fazla iki seviye).",
          cause: error,
        }),
      );
    }
    logger.error({ code: error.code, message: error.message }, "create_expense_category_failed");
    return err(new ExternalApiError({ message: "Kategori eklenemedi.", cause: error }));
  }
  return ok(rowToCategory(data as ExpenseCategoryRow));
}

export interface UpdateExpenseCategoryInput {
  name: string;
  parent_id: string | null;
  sort_order: number;
}

export async function updateExpenseCategory(
  id: string,
  input: UpdateExpenseCategoryInput,
): Promise<Result<ExpenseCategory, AppError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("expense_categories")
    .update({ name: input.name, parent_id: input.parent_id, sort_order: input.sort_order })
    .eq("id", id)
    .select(CATEGORY_SELECT)
    .maybeSingle();

  if (error) {
    if (typeof error.message === "string" && error.message.includes(DEPTH_VIOLATION_MESSAGE)) {
      return err(
        new AppError(ErrorCode.BUSINESS_RULE_VIOLATION, {
          message: "Bir alt kategori, başka bir kategorinin üst kategorisi olamaz (en fazla iki seviye).",
          cause: error,
        }),
      );
    }
    logger.error({ id, code: error.code, message: error.message }, "update_expense_category_failed");
    return err(new ExternalApiError({ message: "Kategori güncellenemedi.", cause: error }));
  }
  if (data == null) {
    return err(new NotFoundError({ message: "Kategori bulunamadı." }));
  }
  return ok(rowToCategory(data as ExpenseCategoryRow));
}

export async function setExpenseCategoryActive(
  id: string,
  active: boolean,
): Promise<Result<void, ExternalApiError | NotFoundError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("expense_categories")
    .update({ active })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    logger.error({ id, code: error.code, message: error.message }, "set_expense_category_active_failed");
    return err(new ExternalApiError({ message: "Kategori durumu güncellenemedi.", cause: error }));
  }
  if (data == null) {
    return err(new NotFoundError({ message: "Kategori bulunamadı." }));
  }
  return ok(undefined);
}
