"use server";

/**
 * Archive (active=false) or restore (active=true) a product. Admin-only.
 * Archiving hides it from the order forms but never touches order history —
 * past orders snapshot their own product data. Hard delete is intentionally
 * not offered: order_items has an ON DELETE RESTRICT FK to products.
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { setProductActiveSchema } from "@/features/products/domain/product.schema";
import { setProductActive } from "@/features/products/infrastructure/product.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

export async function setProductActiveAction(
  raw: unknown,
): Promise<Result<void, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = setProductActiveSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz istek.",
        details: parsed.error.flatten(),
      }),
    );
  }
  const { product_key, active } = parsed.data;

  const result = await setProductActive(product_key, active);
  if (!result.ok) return err(result.error);

  await logAudit({
    actor_id: auth.value.id,
    // Restore is a plain update; archive gets its own verb for auditability.
    action: active ? "product.updated" : "product.archived",
    entity_type: "product",
    entity_id: product_key,
    after: { active },
  });

  revalidatePath("/products");
  revalidatePath("/orders/new");
  return ok(undefined);
}
