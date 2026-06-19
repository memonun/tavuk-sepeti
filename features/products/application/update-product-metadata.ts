"use server";

/**
 * Update a product's content fields (name, unit, unit label, quantity rules).
 * Admin-only. Price/tiers are saved separately (see save-product-pricing).
 * Affects FUTURE orders only — existing orders keep their frozen snapshot.
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { updateProductMetadataSchema } from "@/features/products/domain/product.schema";
import { updateProductMetadata } from "@/features/products/infrastructure/product.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

export async function updateProductMetadataAction(
  raw: unknown,
): Promise<Result<void, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = updateProductMetadataSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz ürün.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const { product_key, ...metadata } = parsed.data;

  const updated = await updateProductMetadata(product_key, metadata);
  if (!updated.ok) return err(updated.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "product.updated",
    entity_type: "product",
    entity_id: product_key,
    after: {
      display_name: metadata.display_name,
      unit: metadata.unit,
      unit_label: metadata.unit_label,
      package_size: metadata.package_size,
      min_qty: metadata.min_qty,
      step: metadata.step,
    },
  });

  revalidatePath("/products");
  revalidatePath("/orders/new");
  return ok(undefined);
}
