"use server";

/**
 * Create a catalog product. Admin-only. The PK `key` is minted server-side
 * from the display name (the admin never sets it). Affects the order forms
 * immediately (new product becomes selectable); existing orders are untouched.
 */
import { revalidatePath } from "next/cache";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import { createProductSchema } from "@/features/products/domain/product.schema";
import { createProduct } from "@/features/products/infrastructure/product.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

export async function createProductAction(
  raw: unknown,
): Promise<Result<{ key: string }, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = createProductSchema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz ürün.",
        details: parsed.error.flatten(),
      }),
    );
  }

  const created = await createProduct(parsed.data);
  if (!created.ok) return err(created.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "product.created",
    entity_type: "product",
    entity_id: created.value,
    after: {
      display_name: parsed.data.display_name,
      unit: parsed.data.unit,
      base_price_minor: parsed.data.base_price_minor,
    },
  });

  revalidatePath("/products");
  revalidatePath("/orders/new");
  return ok({ key: created.value });
}
