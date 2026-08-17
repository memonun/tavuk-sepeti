"use server";

/**
 * Update a product's homepage/admin-list display order. Admin-only. Lower
 * `sort_order` shows first. Revalidates the catalog page and the storefront
 * so a reorder is reflected immediately.
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { updateProductSortOrderSchema } from "@/features/products/domain/product.schema";
import { updateProductSortOrder } from "@/features/products/infrastructure/product.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

export async function updateProductSortOrderAction(
  raw: unknown,
): Promise<Result<void, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = updateProductSortOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz istek.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const { product_key, sort_order } = parsed.data;

  const result = await updateProductSortOrder(product_key, sort_order);
  if (!result.ok) return err(result.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "product.updated",
    entity_type: "product",
    entity_id: product_key,
    after: { sort_order },
  });

  revalidatePath("/products");
  revalidatePath("/");
  return ok(undefined);
}
