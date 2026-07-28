"use server";

/**
 * Toggle a product's storefront flags — `is_web_visible` (shown on the public
 * shop) and `is_featured` (öne çıkan highlight). Admin-only. Only the provided
 * flags are updated. Revalidates the catalog page and the storefront so a
 * visibility change is reflected immediately.
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { updateProductFlagsSchema } from "@/features/products/domain/product.schema";
import { updateProductFlags } from "@/features/products/infrastructure/product.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

export async function updateProductFlagsAction(
  raw: unknown,
): Promise<Result<void, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = updateProductFlagsSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz istek.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const { product_key, ...flags } = parsed.data;

  const result = await updateProductFlags(product_key, flags);
  if (!result.ok) return err(result.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "product.updated",
    entity_type: "product",
    entity_id: product_key,
    after: flags,
  });

  revalidatePath("/products");
  revalidatePath("/");
  return ok(undefined);
}
