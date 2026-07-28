"use server";

/**
 * Remove a product's cover image. Admin-only. Clears the row's `image_path`
 * (the storefront falls back to the emoji placeholder) and best-effort deletes
 * the stored object.
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { productKeySchema } from "@/features/products/domain/product.schema";
import {
  deleteProductImageObject,
  getProductImagePath,
  setProductImagePath,
} from "@/features/products/infrastructure/product.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

export async function removeProductImageAction(
  raw: unknown,
): Promise<Result<void, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = productKeySchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError({ message: "Geçersiz istek." }));
  }
  const { product_key } = parsed.data;

  const current = await getProductImagePath(product_key);
  if (!current.ok) return err(current.error);

  const cleared = await setProductImagePath(product_key, null, null);
  if (!cleared.ok) return err(cleared.error);

  if (current.value) {
    const removed = await deleteProductImageObject(current.value);
    if (!removed.ok) {
      logger.warn(
        { productKey: product_key, stale: current.value },
        "product_image_delete_failed",
      );
    }
  }

  await logAudit({
    actor_id: auth.value.id,
    action: "product.updated",
    entity_type: "product",
    entity_id: product_key,
    after: { image_path: null },
  });

  revalidatePath("/products");
  revalidatePath("/");
  return ok(undefined);
}
