"use server";

/**
 * Cell-level inline edit for the orders DataGrid.
 *
 * Status transitions are delegated to `transitionOrderAction` which runs
 * the full state-machine validation and writes its own audit event.
 * All other fields go through `patchOrderCell` (plain DB UPDATE) followed
 * by a single audit row here.
 *
 * Returns Result<OrderListItem, AppError> so the grid can swap its optimistic
 * patch for the canonical row on success, or roll back on Err.
 */
import {
  orderCellPatchSchema,
  type OrderCellPatch,
} from "@/features/orders/domain/order.schema";
import {
  findOrderListItemById,
  patchOrderCell as repoPatch,
} from "@/features/orders/infrastructure/order.repository";
import { transitionOrderAction } from "@/features/orders/application/transition-order";
import { assertAdmin } from "@/features/auth/application/assert-admin";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

import type { OrderListItem } from "@/features/orders/domain/order";

export async function patchOrderCellAction(
  orderId: string,
  patch: OrderCellPatch,
): Promise<Result<OrderListItem, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);
  const user = auth.value;

  const parsed = orderCellPatchSchema.safeParse(patch);
  if (!parsed.success) {
    logger.warn(
      { orderId, issues: parsed.error.issues },
      "patch_order_cell_invalid",
    );
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz değer.",
        details: parsed.error.flatten(),
      }),
    );
  }

  // Status → delegate to the state machine. transitionOrderAction validates
  // the transition graph + cancel-reason rule, persists via RPC, and writes
  // its own audit event — no additional audit needed here.
  if (parsed.data.field === "status") {
    const { to, reason } = parsed.data.value;
    const res = await transitionOrderAction({
      order_id: orderId,
      to_status: to,
      reason,
    });
    if (res.status === "error") {
      return err(new ValidationError({ message: res.message }));
    }
    // transitionOrderAction already called revalidatePath; just return the
    // freshly-projected list-item.
    return findOrderListItemById(orderId);
  }

  // Plain field patch. TypeScript narrows parsed.data to one of the
  // non-status discriminated variants here, so parsed.data.field is
  // Exclude<OrderCellField, "status"> and repoPatch accepts it without casts.
  const result = await repoPatch(orderId, parsed.data.field, parsed.data.value);
  if (!result.ok) {
    logger.error(
      { orderId, field: parsed.data.field, code: result.error.code },
      "patch_order_cell_action_failed",
    );
    return err(result.error);
  }

  await logAudit({
    actor_id: user.id,
    action: "order.updated",
    entity_type: "order",
    entity_id: orderId,
    before: null,
    after: { [parsed.data.field]: parsed.data.value },
    metadata: { source: "data_grid_inline_edit", field: parsed.data.field },
  });

  // No revalidatePath here: the grid is optimistic and the realtime hook fires
  // a single debounced confirm-refresh after the user pauses (self-write
  // cooldown). Revalidating per edit caused a full-table refetch per keystroke.

  return ok(result.value);
}
