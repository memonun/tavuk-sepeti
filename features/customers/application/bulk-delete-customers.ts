"use server";

/**
 * Bulk delete Server Action backing the DataGrid bulk action bar.
 *
 * Defensive on input — rejects empty arrays + caps at 100 ids per call
 * (matches CLAUDE.md §9 page-size cap; an admin should never need to
 * delete a thousand rows in one click anyway). Each delete writes one
 * audit row with the customer id; PII isn't carried (the row is gone).
 */
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import { CUSTOMER_FILTER_TAG } from "@/features/customers/application/get-filter-options";
import { bulkDeleteCustomers as repoBulkDelete } from "@/features/customers/infrastructure/customer.repository";
import { getCurrentUser } from "@/features/auth/application/get-session";
import { logAudit } from "@/shared/audit/log-audit";
import {
  AppError,
  UnauthorizedError,
  ValidationError,
} from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

const bulkDeleteSchema = z
  .array(z.string().uuid("Geçersiz müşteri kimliği."))
  .min(1, "En az bir kayıt seçilmeli.")
  .max(100, "Tek seferde en fazla 100 kayıt silebilirsin.");

export async function bulkDeleteCustomersAction(
  rawIds: ReadonlyArray<string>,
): Promise<Result<{ deleted: number }, AppError>> {
  const user = await getCurrentUser();
  if (!user) {
    return err(new UnauthorizedError({ message: "Oturum bulunamadı." }));
  }

  const parsed = bulkDeleteSchema.safeParse(rawIds);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz seçim.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const result = await repoBulkDelete(parsed.data);
  if (!result.ok) {
    logger.error({ code: result.error.code }, "bulk_delete_customers_repo_failed");
    return err(result.error);
  }

  await Promise.all(
    parsed.data.map((id) =>
      logAudit({
        actor_id: user.id,
        action: "customer.updated", // no "customer.deleted" in the audit enum yet
        entity_type: "customer",
        entity_id: id,
        before: null,
        after: null,
        metadata: { source: "data_grid_bulk_delete", deleted: true },
      }),
    ),
  );

  revalidatePath("/customers");
  updateTag(CUSTOMER_FILTER_TAG);
  return ok(result.value);
}
