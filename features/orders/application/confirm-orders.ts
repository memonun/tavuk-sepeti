"use server";

/**
 * Bulk-confirm orders — the dispatch step behind "Onayla & Başlat".
 *
 * Authenticates, delegates to `confirmOrdersAs` (shared with the MCP connector),
 * then revalidates the order + route pages.
 *
 * Lives in the orders feature (confirming is an orders concern); the routing
 * UI calls it across the application boundary, the same way driver mode calls
 * completeDeliveryAction.
 */
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { confirmOrdersAs } from "@/features/orders/application/confirm-orders-as";

export type ConfirmOrdersActionState =
  | { status: "success"; confirmed: number }
  | { status: "error"; message: string };

export async function confirmOrdersAction(
  input: { order_ids: string[] },
): Promise<ConfirmOrdersActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  const result = await confirmOrdersAs(user, input);
  if (result.status === "error") return result;

  revalidatePath("/orders");
  revalidatePath("/routes");
  return { status: "success", confirmed: result.confirmed };
}
