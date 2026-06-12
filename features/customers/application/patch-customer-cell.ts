"use server";

/**
 * Cell-level inline edit for the customers DataGrid.
 *
 * The grid calls this once per cell commit. Each call is its own
 * transaction; the optimistic UI hides the latency. Audit log writes
 * for every successful patch — PII fields (name/phone/email/address) get
 * their values redacted at the audit boundary; the field name + actor +
 * customer id are kept so we can answer "who changed phone for customer
 * X at HH:MM" without ever surfacing the value.
 *
 * Returns Result<CustomerListItem, AppError> — the grid swaps its
 * optimistic patch for the canonical row on success, or rolls back on
 * Err.
 */
import { updateTag } from "next/cache";

import { CUSTOMER_FILTER_TAG } from "@/features/customers/application/get-filter-options";
import {
  PII_CELL_FIELDS,
  customerCellPatchSchema,
  type CustomerCellField,
  type CustomerCellPatch,
} from "@/features/customers/domain/customer.schema";
import {
  patchCustomerCell as repoPatchCell,
} from "@/features/customers/infrastructure/customer.repository";
import { assertAdmin } from "@/features/auth/application/assert-admin";
import { logAudit } from "@/shared/audit/log-audit";
import {
  AppError,
  ValidationError,
} from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

import type { CustomerListItem } from "@/features/customers/domain/customer";

const REDACTED = "[REDACTED]" as const;

export async function patchCustomerCellAction(
  customerId: string,
  patch: CustomerCellPatch,
): Promise<Result<CustomerListItem, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);
  const user = auth.value;

  // Re-parse on the server boundary even though the UI already validated:
  // the grid posts via Server Action so the wire is trusted, but
  // CLAUDE.md §4 says every boundary parses anyway.
  const parsed = customerCellPatchSchema.safeParse(patch);
  if (!parsed.success) {
    logger.warn(
      { customerId, issues: parsed.error.issues },
      "patch_customer_cell_invalid",
    );
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz değer.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const { field, value } = parsed.data;
  const result = await repoPatchCell(customerId, field, value);

  if (!result.ok) {
    logger.error(
      { customerId, field, code: result.error.code },
      "patch_customer_cell_failed",
    );
    return err(result.error);
  }

  await logAudit({
    actor_id: user.id,
    action: "customer.updated",
    entity_type: "customer",
    entity_id: customerId,
    before: null,
    after: redactedAuditPayload(field, value),
    metadata: { source: "data_grid_inline_edit", field },
  });

  // No revalidatePath here: the grid is optimistic and the realtime hook fires
  // a single debounced confirm-refresh after the user pauses (self-write
  // cooldown), instead of a full-table refetch per keystroke. The filter-options
  // tag is still busted — it's a separate, cheap cache that drives the dropdowns.
  if (field === "tag" || field === "legacy_segment" || field === "account_type" || field === "city") {
    updateTag(CUSTOMER_FILTER_TAG);
  }

  return ok(result.value);
}

function redactedAuditPayload(
  field: CustomerCellField,
  value: unknown,
): Record<string, unknown> {
  if (PII_CELL_FIELDS.has(field)) {
    return { [field]: REDACTED };
  }
  return { [field]: value as unknown };
}
