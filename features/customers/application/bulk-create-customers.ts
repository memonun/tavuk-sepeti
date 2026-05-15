"use server";

/**
 * Bulk-create Server Action backing the DataGrid paste-into-empty-rows
 * flow. Receives the parsed payload from the paste preview dialog and
 * inserts every row in one Supabase batch.
 *
 * Validation sits at the boundary (CLAUDE.md §4) — the dialog already
 * validated, but we re-parse here because the wire is trusted by the
 * route handler convention only after this point.
 *
 * Audit log writes one entry per inserted row with PII redacted; the
 * count + actor are kept so the audit trail can answer "who pasted N
 * customers at HH:MM" without leaking phones / names into the log
 * stream.
 */
import { revalidatePath, updateTag } from "next/cache";

import { CUSTOMER_FILTER_TAG } from "@/features/customers/application/get-filter-options";
import {
  bulkCreateCustomersSchema,
  type BulkCreateCustomerRow,
} from "@/features/customers/domain/customer.schema";
import { bulkCreateCustomers as repoBulkCreate } from "@/features/customers/infrastructure/customer.repository";
import { getCurrentUser } from "@/features/auth/application/get-session";
import { logAudit } from "@/shared/audit/log-audit";
import {
  AppError,
  UnauthorizedError,
  ValidationError,
} from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

import type { CustomerListItem } from "@/features/customers/domain/customer";

export async function bulkCreateCustomersAction(
  rawRows: ReadonlyArray<unknown>,
): Promise<Result<CustomerListItem[], AppError>> {
  const user = await getCurrentUser();
  if (!user) {
    return err(new UnauthorizedError({ message: "Oturum bulunamadı." }));
  }

  const parsed = bulkCreateCustomersSchema.safeParse(rawRows);
  if (!parsed.success) {
    logger.warn(
      { issueCount: parsed.error.issues.length },
      "bulk_create_customers_invalid_payload",
    );
    return err(
      new ValidationError({
        message:
          parsed.error.issues[0]?.message ??
          "Yapıştırılan satırlardan biri geçersiz.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const result = await repoBulkCreate(parsed.data, user.id);
  if (!result.ok) {
    logger.error(
      { code: result.error.code, count: parsed.data.length },
      "bulk_create_customers_repo_failed",
    );
    return err(result.error);
  }

  // One audit row per inserted customer. PII redaction matches
  // patch-customer-cell — the value is held by the row itself, the audit
  // record only proves an admin caused it to exist.
  await Promise.all(
    result.value.map((customer, idx) => {
      const sourceRow = parsed.data[idx] as BulkCreateCustomerRow | undefined;
      return logAudit({
        actor_id: user.id,
        action: "customer.created",
        entity_type: "customer",
        entity_id: customer.id,
        before: null,
        after: {
          first_name: "[REDACTED]",
          last_name: "[REDACTED]",
          phone: "[REDACTED]",
          status: customer.status,
          account_type: customer.account_type,
          tag: sourceRow?.tag ?? null,
          legacy_segment: sourceRow?.legacy_segment ?? null,
        },
        metadata: { source: "data_grid_paste_create", batch_size: result.value.length },
      });
    }),
  );

  // Filter dropdowns may have new tag/segment values; bust their cache.
  revalidatePath("/customers");
  updateTag(CUSTOMER_FILTER_TAG);

  return ok(result.value);
}
