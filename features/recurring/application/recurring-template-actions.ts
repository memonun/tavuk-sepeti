"use server";

/**
 * Server Actions for recurring template CRUD.
 *
 * Pattern exactly mirrors features/customers/application/bulk-delete-customers.ts:
 *   assertAdmin → Zod parse → repo → logAudit → revalidatePath → Result<…>
 *
 * `first_run_at` (optional YYYY-MM-DD): when provided the form overrides the
 * start date for the first occurrence calculation; otherwise today in Istanbul
 * is used.
 */

import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { firstRunOnOrAfter } from "@/features/recurring/domain/compute-next-run";
import { recurringTemplateFormSchema } from "@/features/recurring/domain/recurring-template.schema";
import {
  createTemplate,
  deleteTemplate,
  findTemplateById,
  listAllTemplates,
  listTemplatesByCustomer,
  setTemplateActive,
  updateTemplate,
} from "@/features/recurring/infrastructure/recurring-template.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";
import { todayInIstanbul } from "@/shared/utils/date";

import type {
  RecurringTemplate,
  RecurringTemplateListItem,
} from "@/features/recurring/domain/recurring-template";

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createRecurringTemplateAction(
  raw: unknown,
): Promise<Result<RecurringTemplate, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);
  const user = auth.value;

  const parsed = recurringTemplateFormSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz şablon verisi.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const p = parsed.data;
  const startYmd = p.first_run_at ?? todayInIstanbul();
  const next_run_at = firstRunOnOrAfter(startYmd, p.cadence, {
    dayOfWeek: p.day_of_week,
    dayOfMonth: p.day_of_month,
  });

  const result = await createTemplate({
    customer_id: p.customer_id,
    cadence: p.cadence,
    day_of_week: p.day_of_week,
    day_of_month: p.day_of_month,
    items: p.items,
    payment_method: p.payment_method,
    active: p.active,
    next_run_at,
  });

  if (!result.ok) return err(result.error);
  const tpl = result.value;

  await logAudit({
    actor_id: user.id,
    action: "recurring.created",
    entity_type: "recurring_template",
    entity_id: tpl.id,
    after: {
      customer_id: tpl.customer_id,
      cadence: tpl.cadence,
      item_count: tpl.items.length,
    },
  });

  revalidatePath(`/customers/${tpl.customer_id}`);
  return ok(tpl);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateRecurringTemplateAction(
  id: string,
  raw: unknown,
): Promise<Result<RecurringTemplate, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);
  const user = auth.value;

  const parsed = recurringTemplateFormSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz şablon verisi.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const p = parsed.data;

  // Recompute next_run_at from first_run_at if caller supplied one; otherwise
  // advance from today (so an update always moves next_run_at to the future).
  const startYmd = p.first_run_at ?? todayInIstanbul();
  const next_run_at = firstRunOnOrAfter(startYmd, p.cadence, {
    dayOfWeek: p.day_of_week,
    dayOfMonth: p.day_of_month,
  });

  const result = await updateTemplate(id, {
    cadence: p.cadence,
    day_of_week: p.day_of_week,
    day_of_month: p.day_of_month,
    items: p.items,
    payment_method: p.payment_method,
    active: p.active,
    next_run_at,
  });

  if (!result.ok) return err(result.error);
  const tpl = result.value;

  await logAudit({
    actor_id: user.id,
    action: "recurring.updated",
    entity_type: "recurring_template",
    entity_id: tpl.id,
    after: {
      customer_id: tpl.customer_id,
      cadence: tpl.cadence,
      item_count: tpl.items.length,
    },
  });

  revalidatePath(`/customers/${tpl.customer_id}`);
  return ok(tpl);
}

// ---------------------------------------------------------------------------
// Set active (pause / resume)
// ---------------------------------------------------------------------------

export async function setRecurringTemplateActiveAction(
  id: string,
  active: boolean,
): Promise<Result<RecurringTemplate, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);
  const user = auth.value;

  // Fetch first: need cadence/shape for next_run_at calculation + audit.
  const findResult = await findTemplateById(id);
  if (!findResult.ok) return err(findResult.error);
  const tpl = findResult.value;

  const nextRun = active
    ? firstRunOnOrAfter(todayInIstanbul(), tpl.cadence, {
        dayOfWeek: tpl.day_of_week,
        dayOfMonth: tpl.day_of_month,
      })
    : null;

  const result = await setTemplateActive(id, active, nextRun);
  if (!result.ok) return err(result.error);
  const updated = result.value;

  await logAudit({
    actor_id: user.id,
    action: active ? "recurring.resumed" : "recurring.paused",
    entity_type: "recurring_template",
    entity_id: id,
    after: { active, next_run_at: nextRun?.toISOString() ?? null },
  });

  revalidatePath(`/customers/${tpl.customer_id}`);
  return ok(updated);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteRecurringTemplateAction(
  id: string,
): Promise<Result<void, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);
  const user = auth.value;

  // Fetch before delete for customer_id (revalidate) + audit before-state.
  const findResult = await findTemplateById(id);
  if (!findResult.ok) return err(findResult.error);
  const tpl = findResult.value;

  const result = await deleteTemplate(id);
  if (!result.ok) return err(result.error);

  await logAudit({
    actor_id: user.id,
    action: "recurring.deleted",
    entity_type: "recurring_template",
    entity_id: id,
    before: {
      customer_id: tpl.customer_id,
      cadence: tpl.cadence,
      item_count: tpl.items.length,
      active: tpl.active,
    },
  });

  revalidatePath(`/customers/${tpl.customer_id}`);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Get by id (read — no audit)
// ---------------------------------------------------------------------------

export async function getRecurringTemplateAction(
  id: string,
): Promise<Result<RecurringTemplate, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const result = await findTemplateById(id);
  if (!result.ok) return err(result.error);
  return ok(result.value);
}

// ---------------------------------------------------------------------------
// List by customer (read — no audit)
// ---------------------------------------------------------------------------

export async function listCustomerRecurringTemplatesAction(
  customerId: string,
): Promise<Result<RecurringTemplateListItem[], AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const result = await listTemplatesByCustomer(customerId);
  if (!result.ok) return err(result.error);
  return ok(result.value);
}

// ---------------------------------------------------------------------------
// List all templates — global overview (read — no audit)
// ---------------------------------------------------------------------------

export async function listAllRecurringTemplatesAction(): Promise<
  Result<RecurringTemplateListItem[], AppError>
> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const result = await listAllTemplates();
  if (!result.ok) return err(result.error);
  return ok(result.value);
}
