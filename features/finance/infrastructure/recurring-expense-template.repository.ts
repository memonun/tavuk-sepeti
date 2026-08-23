/**
 * Persistence layer for recurring_expense_templates + the
 * generate_recurring_expense RPC. Table/RPC postdate the last Supabase type
 * generation, so every query goes through the `(supabase as any)` cast —
 * same convention as features/recurring/infrastructure/recurring-template.repository.ts.
 */
import "server-only";

import { AppError, ExternalApiError, NotFoundError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { ManualPaymentMethod } from "@/features/finance/domain/expense";
import type {
  RecurringExpenseAmountType,
  RecurringExpenseCadence,
  RecurringExpenseTemplate,
} from "@/features/finance/domain/recurring-expense-template";

/** recurring_expense_templates.category_id -> on delete restrict; a
 *  template that already generated expenses can't be hard-deleted either
 *  (expenses.recurring_template_id -> on delete restrict). Both surface as
 *  this code. */
const FOREIGN_KEY_VIOLATION = "23503";

const TEMPLATE_SELECT =
  "id, name, category_id, vendor, description, amount_type, default_amount_minor, cadence, day_of_week, day_of_month, start_date, end_date, payment_method, active, note, next_run_at, created_by, created_at, updated_at" as const;

type TemplateRow = {
  id: string;
  name: string;
  category_id: string;
  vendor: string | null;
  description: string | null;
  amount_type: RecurringExpenseAmountType;
  default_amount_minor: number;
  cadence: RecurringExpenseCadence;
  day_of_week: number | null;
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  payment_method: ManualPaymentMethod | null;
  active: boolean;
  note: string | null;
  next_run_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function rowToTemplate(row: TemplateRow): RecurringExpenseTemplate {
  return {
    id: row.id,
    name: row.name,
    category_id: row.category_id,
    vendor: row.vendor,
    description: row.description,
    amount_type: row.amount_type,
    default_amount_minor: row.default_amount_minor,
    cadence: row.cadence,
    day_of_week: row.day_of_week,
    day_of_month: row.day_of_month,
    start_date: row.start_date,
    end_date: row.end_date,
    payment_method: row.payment_method,
    active: row.active,
    note: row.note,
    next_run_at: new Date(row.next_run_at),
    created_by: row.created_by,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

export type RecurringExpenseRepoFailure = ExternalApiError | NotFoundError | AppError;

export interface TemplateWriteInput {
  name: string;
  category_id: string;
  vendor: string | null;
  description: string | null;
  amount_type: RecurringExpenseAmountType;
  default_amount_minor: number;
  cadence: RecurringExpenseCadence;
  day_of_week: number | null;
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  payment_method: ManualPaymentMethod | null;
  note: string | null;
  next_run_at: Date;
}

export async function createTemplate(
  input: TemplateWriteInput,
  createdBy: string,
): Promise<Result<RecurringExpenseTemplate, RecurringExpenseRepoFailure>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("recurring_expense_templates")
    .insert({
      name: input.name,
      category_id: input.category_id,
      vendor: input.vendor,
      description: input.description,
      amount_type: input.amount_type,
      default_amount_minor: input.default_amount_minor,
      cadence: input.cadence,
      day_of_week: input.day_of_week,
      day_of_month: input.day_of_month,
      start_date: input.start_date,
      end_date: input.end_date,
      payment_method: input.payment_method,
      note: input.note,
      next_run_at: input.next_run_at.toISOString(),
      created_by: createdBy,
    })
    .select(TEMPLATE_SELECT)
    .single();

  if (error) {
    logger.error({ code: error.code, message: error.message }, "recurring_expense_template_create_failed");
    return err(new ExternalApiError({ message: "Rutin gider eklenemedi.", cause: error }));
  }
  return ok(rowToTemplate(data as TemplateRow));
}

export async function updateTemplate(
  id: string,
  input: TemplateWriteInput,
): Promise<Result<RecurringExpenseTemplate, RecurringExpenseRepoFailure>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("recurring_expense_templates")
    .update({
      name: input.name,
      category_id: input.category_id,
      vendor: input.vendor,
      description: input.description,
      amount_type: input.amount_type,
      default_amount_minor: input.default_amount_minor,
      cadence: input.cadence,
      day_of_week: input.day_of_week,
      day_of_month: input.day_of_month,
      start_date: input.start_date,
      end_date: input.end_date,
      payment_method: input.payment_method,
      note: input.note,
      next_run_at: input.next_run_at.toISOString(),
    })
    .eq("id", id)
    .select(TEMPLATE_SELECT)
    .maybeSingle();

  if (error) {
    logger.error({ id, code: error.code, message: error.message }, "recurring_expense_template_update_failed");
    return err(new ExternalApiError({ message: "Rutin gider güncellenemedi.", cause: error }));
  }
  if (data == null) {
    return err(new NotFoundError({ message: "Rutin gider şablonu bulunamadı." }));
  }
  return ok(rowToTemplate(data as TemplateRow));
}

/** Pause: keeps next_run_at as-is (resuming re-anchors it forward). Resume:
 *  caller passes a freshly computed next_run_at so a long-paused template
 *  doesn't immediately back-generate every missed period. */
export async function setTemplateActive(
  id: string,
  active: boolean,
  nextRunAt?: Date,
): Promise<Result<RecurringExpenseTemplate, RecurringExpenseRepoFailure>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("recurring_expense_templates")
    .update({ active, ...(nextRunAt ? { next_run_at: nextRunAt.toISOString() } : {}) })
    .eq("id", id)
    .select(TEMPLATE_SELECT)
    .maybeSingle();

  if (error) {
    logger.error({ id, active, code: error.code }, "recurring_expense_template_set_active_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  if (data == null) {
    return err(new NotFoundError({ message: "Rutin gider şablonu bulunamadı." }));
  }
  return ok(rowToTemplate(data as TemplateRow));
}

/** Only succeeds if no expense has ever been generated from this template
 *  (FK restrict) — otherwise surfaces as CONFLICT so the UI can point at
 *  Durdur instead (spec §16: prefer archive/deactivate over destructive delete). */
export async function deleteTemplate(id: string): Promise<Result<void, RecurringExpenseRepoFailure>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("recurring_expense_templates").delete().eq("id", id);

  if (error) {
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return err(
        new AppError(ErrorCode.CONFLICT, {
          message: "Bu rutin giderin geçmiş kayıtları var, silmek yerine durdurabilirsiniz.",
          cause: error,
        }),
      );
    }
    logger.error({ id, code: error.code }, "recurring_expense_template_delete_failed");
    return err(new ExternalApiError({ message: "Rutin gider silinemedi.", cause: error }));
  }
  return ok(undefined);
}

export async function findTemplateById(
  id: string,
): Promise<Result<RecurringExpenseTemplate, RecurringExpenseRepoFailure>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("recurring_expense_templates")
    .select(TEMPLATE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logger.error({ id, code: error.code }, "recurring_expense_template_find_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  if (data == null) {
    return err(new NotFoundError({ message: "Rutin gider şablonu bulunamadı." }));
  }
  return ok(rowToTemplate(data as TemplateRow));
}

export async function listAllTemplates(): Promise<Result<RecurringExpenseTemplate[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("recurring_expense_templates")
    .select(TEMPLATE_SELECT)
    .order("active", { ascending: false })
    .order("next_run_at", { ascending: true });

  if (error) {
    logger.error({ code: error.code }, "recurring_expense_templates_list_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(((data ?? []) as TemplateRow[]).map(rowToTemplate));
}

export async function listDueTemplates(
  cutoff: Date,
): Promise<Result<RecurringExpenseTemplate[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("recurring_expense_templates")
    .select(TEMPLATE_SELECT)
    .eq("active", true)
    .lte("next_run_at", cutoff.toISOString());

  if (error) {
    logger.error({ code: error.code }, "recurring_expense_templates_list_due_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(((data ?? []) as TemplateRow[]).map(rowToTemplate));
}

export async function advanceNextRun(
  id: string,
  next: Date,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("recurring_expense_templates")
    .update({ next_run_at: next.toISOString() })
    .eq("id", id);

  if (error) {
    logger.error({ id, code: error.code }, "recurring_expense_template_advance_next_run_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

export async function generateRecurringExpense(
  templateId: string,
  expenseDate: string,
  createdBy: string | null,
): Promise<Result<{ expense_id: string }, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("generate_recurring_expense", {
    p_template_id: templateId,
    p_expense_date: expenseDate,
    p_created_by: createdBy,
  });

  if (error) {
    logger.error({ templateId, code: error.code }, "generate_recurring_expense_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok({ expense_id: String(data) });
}
