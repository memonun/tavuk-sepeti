"use server";

/**
 * Upload (or replace) a product's cover image. Admin-only. The client sends an
 * already-compressed image as multipart FormData; here we re-validate type and
 * size (never trust the client), store the object under a fresh key, point the
 * product row at it, and best-effort delete the previous object so replacements
 * don't leak storage. The bucket is public-read, so the storefront can serve
 * the new URL over the CDN immediately.
 */
import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import {
  PRODUCT_IMAGE_MAX_BYTES,
  buildProductImageKey,
  imageExtForType,
  isAllowedProductImageType,
} from "@/features/products/domain/product-image";
import {
  deleteProductImageObject,
  getProductImagePath,
  setProductImagePath,
  uploadProductImageObject,
} from "@/features/products/infrastructure/product.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";

export async function uploadProductImageAction(
  formData: FormData,
): Promise<Result<{ imagePath: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const productKey = formData.get("product_key");
  const file = formData.get("file");

  if (typeof productKey !== "string" || productKey.length === 0) {
    return err(new ValidationError({ message: "Ürün belirtilmedi." }));
  }
  if (!(file instanceof File)) {
    return err(new ValidationError({ message: "Dosya bulunamadı." }));
  }
  const ext = imageExtForType(file.type);
  if (!ext || !isAllowedProductImageType(file.type)) {
    return err(
      new ValidationError({ message: "Yalnızca JPEG, PNG veya WEBP yükleyin." }),
    );
  }
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
    return err(new ValidationError({ message: "Görsel 5 MB'den küçük olmalı." }));
  }

  // Remember the current object so we can clean it up after a successful swap.
  const current = await getProductImagePath(productKey);
  if (!current.ok) return err(current.error);

  const objectKey = buildProductImageKey(
    productKey,
    ext,
    randomUUID().replace(/-/g, "").slice(0, 12),
  );
  const bytes = new Uint8Array(await file.arrayBuffer());

  const uploaded = await uploadProductImageObject(objectKey, bytes, file.type);
  if (!uploaded.ok) return err(uploaded.error);

  const saved = await setProductImagePath(productKey, objectKey);
  if (!saved.ok) {
    // Roll back the orphaned object we just wrote (best-effort).
    await deleteProductImageObject(objectKey);
    return err(saved.error);
  }

  if (current.value && current.value !== objectKey) {
    const removed = await deleteProductImageObject(current.value);
    if (!removed.ok) {
      logger.warn(
        { productKey, stale: current.value },
        "product_image_stale_cleanup_failed",
      );
    }
  }

  await logAudit({
    actor_id: auth.value.id,
    action: "product.updated",
    entity_type: "product",
    entity_id: productKey,
    after: { image_path: objectKey },
  });

  revalidatePath("/products");
  revalidatePath("/");
  return ok({ imagePath: objectKey });
}
