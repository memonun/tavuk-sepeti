"use server";

/**
 * Adds a blank customer row for the grid's "+ Yeni satır" footer. The
 * admin completes it inline or via the detail panel. One audit row marks
 * who created the placeholder; no PII exists yet to redact.
 */
import { revalidatePath } from "next/cache";

import { addCustomerRow as repoAddRow } from "@/features/customers/infrastructure/customer.repository";
import { assertAdmin } from "@/features/auth/application/assert-admin";
import { logAudit } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

import type { CustomerListItem } from "@/features/customers/domain/customer";
import type { AppError } from "@/shared/errors/app-error";

export async function addCustomerRowAction(): Promise<Result<CustomerListItem, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);
  const user = auth.value;

  const result = await repoAddRow(user.id);
  if (!result.ok) {
    logger.error({ code: result.error.code }, "add_customer_row_action_failed");
    return err(result.error);
  }

  await logAudit({
    actor_id: user.id,
    action: "customer.created",
    entity_type: "customer",
    entity_id: result.value.id,
    before: null,
    after: { source: "data_grid_add_row" },
    metadata: { source: "data_grid_add_row" },
  });

  revalidatePath("/customers");
  return ok(result.value);
}
