"use server";

/**
 * Remove one of the signed-in customer's saved addresses.
 *
 * Ownership is enforced in the RPC (P0004), not here — the id arrives from the
 * browser and must never be trusted on this side of the boundary.
 *
 * An address that carries order history cannot be deleted: `orders.address_id`
 * is ON DELETE RESTRICT precisely so the route can still resolve those orders.
 * The repository turns that FK violation into a Turkish explanation.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { deleteCustomerAddress } from "@/features/storefront/infrastructure/customer-account.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";

const deleteAddressSchema = z.object({
  address_id: z.string().uuid("Geçersiz adres."),
});

export type DeleteAddressState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "validation_error"; message: string }
  | { status: "error"; message: string };

export async function deleteAddressAction(
  raw: unknown,
): Promise<DeleteAddressState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  const parsed = deleteAddressSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "validation_error",
      message: parsed.error.issues[0]?.message ?? "Geçersiz adres.",
    };
  }

  const removed = await deleteCustomerAddress(user.id, parsed.data.address_id);
  if (!removed.ok) {
    if (removed.error.code === "VALIDATION_ERROR") {
      return { status: "validation_error", message: removed.error.message };
    }
    logger.error({ code: removed.error.code }, "delete_customer_address_failed");
    return { status: "error", message: "Adres silinemedi, tekrar deneyin." };
  }

  await logAudit({
    actor_id: user.id,
    action: "address.web_updated",
    entity_type: "address",
    entity_id: parsed.data.address_id,
    metadata: { deleted: true },
  });

  revalidatePath("/hesap");
  revalidatePath("/odeme");
  return { status: "success" };
}
