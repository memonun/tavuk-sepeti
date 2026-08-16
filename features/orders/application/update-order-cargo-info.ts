"use server";

/**
 * Set the manual cargo tracking fields (carrier, tracking number, tracking
 * URL) on a shipping-channel order. Deliberately NOT a status transition —
 * these fields are independent of order_status (see order-state-machine.ts):
 * an admin can fill them in before, at, or well after marking an order
 * "shipped", or never at all.
 */
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { orderCargoInfoSchema } from "@/features/orders/domain/order.schema";
import { updateOrderCargoInfo } from "@/features/orders/infrastructure/order.repository";
import { logAudit } from "@/shared/audit/log-audit";

export type UpdateOrderCargoInfoActionState =
  | { status: "success"; orderId: string }
  | { status: "error"; message: string };

export async function updateOrderCargoInfoAction(
  input: unknown,
): Promise<UpdateOrderCargoInfoActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  const parsed = orderCargoInfoSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Geçersiz kargo bilgisi." };
  }

  const result = await updateOrderCargoInfo(parsed.data);
  if (!result.ok) {
    return { status: "error", message: result.error.message };
  }

  await logAudit({
    actor_id: user.id,
    action: "order.cargo_info_updated",
    entity_type: "order",
    entity_id: parsed.data.order_id,
    after: {
      cargo_carrier: parsed.data.cargo_carrier,
      cargo_tracking_number: parsed.data.cargo_tracking_number,
      cargo_tracking_url: parsed.data.cargo_tracking_url,
    },
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${parsed.data.order_id}`);
  return { status: "success", orderId: parsed.data.order_id };
}
