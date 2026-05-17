"use server";

/**
 * Bulk delete Server Action backing the DataGrid bulk action bar.
 *
 * Defensive on input — rejects empty arrays + caps at 100 ids per call
 * (matches CLAUDE.md §9 page-size cap; an admin should never need to
 * delete a thousand rows in one click anyway). Snapshots the rows
 * (PII-redacted) before delete so the audit trail can answer "what was
 * actually deleted" — without the snapshot the row is unrecoverable.
 */
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import { CUSTOMER_FILTER_TAG } from "@/features/customers/application/get-filter-options";
import {
  bulkDeleteCustomers as repoBulkDelete,
  findListItemsByIds,
} from "@/features/customers/infrastructure/customer.repository";
import { assertAdmin } from "@/features/auth/application/assert-admin";
import { logBulkAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

const bulkDeleteSchema = z
  .array(z.string().uuid("Geçersiz müşteri kimliği."))
  .min(1, "En az bir kayıt seçilmeli.")
  .max(100, "Tek seferde en fazla 100 kayıt silebilirsin.");

export async function bulkDeleteCustomersAction(
  rawIds: ReadonlyArray<string>,
): Promise<Result<{ deleted: number }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);
  const user = auth.value;

  const parsed = bulkDeleteSchema.safeParse(rawIds);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz seçim.",
        details: parsed.error.flatten(),
      }),
    );
  }

  // Snapshot before delete so the audit row records *what* was deleted.
  // Best-effort: if the snapshot fetch fails, log and proceed — losing
  // audit detail is better than blocking the delete the admin asked for.
  const snapshotResult = await findListItemsByIds(parsed.data);
  const snapshotById = new Map(
    snapshotResult.ok
      ? snapshotResult.value.map((row) => [row.id, row] as const)
      : [],
  );

  const result = await repoBulkDelete(parsed.data);
  if (!result.ok) {
    logger.error({ code: result.error.code }, "bulk_delete_customers_repo_failed");
    return err(result.error);
  }

  await logBulkAudit(
    parsed.data.map((id) => {
      const snap = snapshotById.get(id);
      // Keep non-PII fields on `before` so the audit can later answer
      // "we deleted N blocked Istanbul customers on date X" without
      // surfacing names / phones / addresses.
      return {
        actor_id: user.id,
        action: "customer.deleted" as const,
        entity_type: "customer" as const,
        entity_id: id,
        before: snap
          ? {
              status: snap.status,
              account_type: snap.account_type,
              city: snap.city,
              tag: snap.tag,
              legacy_segment: snap.legacy_segment,
              first_name: "[REDACTED]",
              last_name: "[REDACTED]",
              phone: "[REDACTED]",
              email: "[REDACTED]",
            }
          : null,
        after: null,
        metadata: { source: "data_grid_bulk_delete", batch_size: parsed.data.length },
      };
    }),
  );

  revalidatePath("/customers");
  updateTag(CUSTOMER_FILTER_TAG);
  return ok(result.value);
}
