/**
 * Persistence layer for recurring_templates.
 *
 * The table was added after the last Supabase type generation so it is not
 * in generated types — every query goes through the `(supabase as any)` cast
 * (mirroring features/customers/infrastructure/customer-bulk.repository.ts).
 *
 * All public functions return `Promise<Result<…, RecurringRepoFailure>>`.
 * DB errors → ExternalApiError; missing rows → NotFoundError.
 */
import "server-only";

import { ExternalApiError, NotFoundError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import {
  rowToListItem,
  rowToRecurringTemplate,
} from "@/features/recurring/infrastructure/recurring-template.mapper";

import type {
  RecurringCadence,
  RecurringPaymentMethod,
  RecurringTemplate,
  RecurringTemplateItem,
  RecurringTemplateListItem,
} from "@/features/recurring/domain/recurring-template";

// ---------------------------------------------------------------------------

export type RecurringRepoFailure = ExternalApiError | NotFoundError | ValidationError;

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateTemplateInput {
  customer_id: string;
  cadence: RecurringCadence;
  day_of_week: number | null;
  day_of_month: number | null;
  items: ReadonlyArray<{ product_key: string; quantity: number }>;
  payment_method: RecurringPaymentMethod;
  active: boolean;
  next_run_at: Date;
}

export interface UpdateTemplateInput {
  cadence: RecurringCadence;
  day_of_week: number | null;
  day_of_month: number | null;
  items: ReadonlyArray<{ product_key: string; quantity: number }>;
  payment_method: RecurringPaymentMethod;
  active: boolean;
  next_run_at: Date;
}

// ---------------------------------------------------------------------------
// Shared select projection
// ---------------------------------------------------------------------------

const TEMPLATE_SELECT =
  "id, customer_id, cadence, day_of_week, day_of_month, items, payment_method, active, next_run_at, source, approved_at, created_at, updated_at" as const;

// ---------------------------------------------------------------------------
// Public repository functions
// ---------------------------------------------------------------------------

export async function createTemplate(
  input: CreateTemplateInput,
): Promise<Result<RecurringTemplate, RecurringRepoFailure>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("recurring_templates")
    .insert({
      customer_id: input.customer_id,
      cadence: input.cadence,
      day_of_week: input.day_of_week,
      day_of_month: input.day_of_month,
      items: input.items as RecurringTemplateItem[],
      payment_method: input.payment_method,
      active: input.active,
      next_run_at: input.next_run_at.toISOString(),
    })
    .select(TEMPLATE_SELECT)
    .single();

  if (error) {
    logger.error(
      { customer_id: input.customer_id, code: error.code },
      "recurring_template_create_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  return ok(rowToRecurringTemplate(data as Record<string, unknown>));
}

export async function updateTemplate(
  id: string,
  input: UpdateTemplateInput,
): Promise<Result<RecurringTemplate, RecurringRepoFailure>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("recurring_templates")
    .update({
      cadence: input.cadence,
      day_of_week: input.day_of_week,
      day_of_month: input.day_of_month,
      items: input.items as RecurringTemplateItem[],
      payment_method: input.payment_method,
      active: input.active,
      next_run_at: input.next_run_at.toISOString(),
    })
    .eq("id", id)
    .select(TEMPLATE_SELECT)
    .maybeSingle();

  if (error) {
    logger.error({ id, code: error.code }, "recurring_template_update_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  if (data == null) {
    return err(new NotFoundError({ message: `Tekrarlı şablon bulunamadı: ${id}` }));
  }

  return ok(rowToRecurringTemplate(data as Record<string, unknown>));
}

export async function setTemplateActive(
  id: string,
  active: boolean,
  nextRunAt: Date | null,
  /** Set only on a customer_web template's FIRST approval (see
   *  setRecurringTemplateActiveAction) — never cleared afterwards. */
  approvedAt?: Date,
): Promise<Result<RecurringTemplate, RecurringRepoFailure>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("recurring_templates")
    .update({
      active,
      ...(nextRunAt != null ? { next_run_at: nextRunAt.toISOString() } : {}),
      ...(approvedAt != null ? { approved_at: approvedAt.toISOString() } : {}),
    })
    .eq("id", id)
    .select(TEMPLATE_SELECT)
    .maybeSingle();

  if (error) {
    logger.error({ id, active, code: error.code }, "recurring_template_set_active_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  if (data == null) {
    return err(new NotFoundError({ message: `Tekrarlı şablon bulunamadı: ${id}` }));
  }

  return ok(rowToRecurringTemplate(data as Record<string, unknown>));
}

export async function deleteTemplate(
  id: string,
): Promise<Result<{ deleted: number }, RecurringRepoFailure>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error, count } = await (supabase as any)
    .from("recurring_templates")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    logger.error({ id, code: error.code }, "recurring_template_delete_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  return ok({ deleted: count ?? 0 });
}

export async function findTemplateById(
  id: string,
): Promise<Result<RecurringTemplate, RecurringRepoFailure>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("recurring_templates")
    .select(TEMPLATE_SELECT)
    .eq("id", id)
    .single();

  if (error) {
    if ((error as { code?: string }).code === "PGRST116") {
      return err(new NotFoundError({ message: `Tekrarlı şablon bulunamadı: ${id}` }));
    }
    logger.error({ id, code: error.code }, "recurring_template_find_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  if (data == null) {
    return err(new NotFoundError({ message: `Tekrarlı şablon bulunamadı: ${id}` }));
  }

  return ok(rowToRecurringTemplate(data as Record<string, unknown>));
}

export async function listDueTemplates(
  cutoff: Date,
): Promise<Result<RecurringTemplate[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("recurring_templates")
    .select(TEMPLATE_SELECT)
    .eq("active", true)
    .lte("next_run_at", cutoff.toISOString());

  if (error) {
    logger.error({ code: error.code }, "recurring_templates_list_due_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  return ok(
    ((data ?? []) as Array<Record<string, unknown>>).map(rowToRecurringTemplate),
  );
}

export async function createRecurringOrder(input: {
  template_id: string;
  scheduled_for: string;
  created_by: string | null;
  items: ReadonlyArray<{
    product_key: string;
    quantity: number;
    unit_price_minor: number;
    product_snapshot: { display_name: string; unit: string; unit_label: string };
  }>;
}): Promise<Result<{ order_id: string }, RecurringRepoFailure>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: rpcError } = await (supabase as any).rpc(
    "create_recurring_order",
    {
      p_template_id: input.template_id,
      p_scheduled_for: input.scheduled_for,
      p_created_by: input.created_by,
      p_items: input.items,
    },
  );

  if (rpcError) {
    logger.error(
      { template_id: input.template_id, code: rpcError.code },
      "recurring_order_create_failed",
    );
    if ((rpcError.message as string).includes("no primary address")) {
      return err(new ValidationError({ message: rpcError.message, cause: rpcError }));
    }
    return err(new ExternalApiError({ message: rpcError.message, cause: rpcError }));
  }

  return ok({ order_id: String(data) });
}

export async function advanceNextRun(
  id: string,
  next: Date,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("recurring_templates")
    .update({ next_run_at: next.toISOString() })
    .eq("id", id);

  if (error) {
    logger.error({ id, code: error.code }, "recurring_template_advance_next_run_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  return ok(undefined);
}

/** Does this customer have a primary delivery address? Used as an approval
 *  gate — create_recurring_order requires one and fails loudly (but silently
 *  to the approver) at materialization time otherwise. `addresses` is a
 *  regular typed table, no cast needed. */
export async function hasPrimaryAddress(
  customerId: string,
): Promise<Result<boolean, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("addresses")
    .select("id")
    .eq("customer_id", customerId)
    .eq("is_primary", true)
    .limit(1);

  if (error) {
    logger.error(
      { customerId, code: error.code },
      "recurring_template_check_primary_address_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok((data ?? []).length > 0);
}

export async function listTemplatesByCustomer(
  customerId: string,
): Promise<Result<RecurringTemplateListItem[], RecurringRepoFailure>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("recurring_templates")
    .select("*, customers!inner(first_name, last_name)")
    .eq("customer_id", customerId)
    .order("next_run_at");

  if (error) {
    logger.error({ customerId, code: error.code }, "recurring_templates_list_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  return ok(
    ((data ?? []) as Array<Record<string, unknown> & { customers: { first_name: string | null; last_name: string | null } | null }>).map(
      rowToListItem,
    ),
  );
}

export async function listAllTemplates(): Promise<Result<RecurringTemplateListItem[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("recurring_templates")
    .select("*, customers!inner(first_name, last_name)")
    .order("active", { ascending: false })
    .order("next_run_at");

  if (error) {
    logger.error({ code: error.code }, "recurring_templates_list_all_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  return ok(
    ((data ?? []) as Array<Record<string, unknown> & { customers: { first_name: string | null; last_name: string | null } | null }>).map(
      rowToListItem,
    ),
  );
}
