"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { deleteOrders } from "@/features/orders/infrastructure/order.repository";
import { assertAdmin } from "@/features/auth/application/assert-admin";
import { logBulkAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

const schema = z
  .array(z.string().uuid("Geçersiz sipariş kimliği."))
  .min(1, "En az bir kayıt seçilmeli.")
  .max(100, "Tek seferde en fazla 100 kayıt silebilirsin.");

export async function bulkDeleteOrdersAction(
  rawIds: ReadonlyArray<string>,
): Promise<Result<{ deleted: number }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);
  const user = auth.value;

  const parsed = schema.safeParse(rawIds);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz seçim.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const result = await deleteOrders(parsed.data);
  if (!result.ok) {
    logger.error({ code: result.error.code }, "bulk_delete_orders_action_failed");
    return err(result.error);
  }

  await logBulkAudit(
    parsed.data.map((id) => ({
      actor_id: user.id,
      action: "order.deleted" as const,
      entity_type: "order" as const,
      entity_id: id,
      before: null,
      after: null,
      metadata: { source: "data_grid_bulk_delete", batch_size: parsed.data.length },
    })),
  );

  revalidatePath("/orders");
  return ok(result.value);
}
