"use server";

/**
 * Hard-delete a product. Admin-only, and only when it has never been
 * ordered — order_items has an ON DELETE RESTRICT FK to products, so this
 * pre-checks the count rather than letting the DB reject it blind. A
 * product with order history stays archive-only (setProductActiveAction).
 *
 * Best-effort cleans up the storage object too: a failed image delete
 * shouldn't block the row delete the admin actually asked for.
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { deleteProductSchema } from "@/features/products/domain/product.schema";
import {
  countOrderItemsForProduct,
  deleteProduct as repoDeleteProduct,
  deleteProductImageObject,
  getProductImagePath,
} from "@/features/products/infrastructure/product.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

export async function deleteProductAction(
  raw: unknown,
): Promise<Result<void, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = deleteProductSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz istek.",
        details: parsed.error.flatten(),
      }),
    );
  }
  const { product_key } = parsed.data;

  const countResult = await countOrderItemsForProduct(product_key);
  if (!countResult.ok) return err(countResult.error);
  if (countResult.value > 0) {
    return err(
      new ValidationError({
        message: `Bu ürün ${countResult.value} sipariş kaleminde kullanılmış, silinemez. Bunun yerine arşivle.`,
      }),
    );
  }

  const imagePathResult = await getProductImagePath(product_key);

  const deleteResult = await repoDeleteProduct(product_key);
  if (!deleteResult.ok) return err(deleteResult.error);

  if (imagePathResult.ok && imagePathResult.value) {
    await deleteProductImageObject(imagePathResult.value);
  }

  await logAudit({
    actor_id: auth.value.id,
    action: "product.deleted",
    entity_type: "product",
    entity_id: product_key,
    after: null,
  });

  revalidatePath("/products");
  revalidatePath("/orders/new");
  return ok(undefined);
}
