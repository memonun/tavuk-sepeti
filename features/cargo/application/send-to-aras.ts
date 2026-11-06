"use server";

/**
 * "Aras'a Gönder" and "Aras kaydını iptal et" Server Actions: admin only.
 * Sending again is allowed and safe — Aras updates the record for the same
 * code (e.g. after the address was corrected), until the branch has accepted
 * the parcel.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { cancelArasShipmentAs, sendOrderToArasAs } from "@/features/cargo/application/aras";
import { assertAdmin } from "@/features/auth/application/assert-admin";

const inputSchema = z.object({ order_id: z.string().uuid() });

export type SendToArasActionState =
  | { status: "success"; integrationCode: string }
  | { status: "error"; message: string };

export async function sendOrderToArasAction(input: unknown): Promise<SendToArasActionState> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Geçersiz sipariş." };

  const admin = await assertAdmin();
  if (!admin.ok) return { status: "error", message: admin.error.message };

  const result = await sendOrderToArasAs(admin.value, parsed.data.order_id);
  if (!result.ok) return { status: "error", message: result.error.message };

  revalidatePath("/kargo");
  revalidatePath(`/orders/${parsed.data.order_id}`);
  return { status: "success", integrationCode: result.value.integrationCode };
}

export type CancelArasActionState =
  | { status: "success" }
  | { status: "error"; message: string };

/** Delete the order's record at Aras without cancelling the order. */
export async function cancelArasShipmentAction(input: unknown): Promise<CancelArasActionState> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Geçersiz sipariş." };

  const admin = await assertAdmin();
  if (!admin.ok) return { status: "error", message: admin.error.message };

  const result = await cancelArasShipmentAs(admin.value, parsed.data.order_id);
  if (!result.ok) return { status: "error", message: result.error.message };

  revalidatePath("/kargo");
  revalidatePath(`/orders/${parsed.data.order_id}`);
  return { status: "success" };
}
