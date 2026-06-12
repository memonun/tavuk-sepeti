"use server";

/**
 * Save a product's pricing: its flat/base unit price + its volume tiers.
 * Admin-only. Affects FUTURE orders only — existing orders keep their frozen
 * line prices (snapshot model).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertAdmin } from "@/features/auth/application/assert-admin";
import {
  replaceProductTiers,
  updateProductBasePrice,
} from "@/features/products/infrastructure/product.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { AppError, ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

const schema = z.object({
  product_key: z.string().min(1),
  base_price_minor: z.coerce.number().nonnegative(),
  tiers: z
    .array(
      z.object({
        min_qty: z.coerce.number().positive(),
        unit_price_minor: z.coerce.number().nonnegative(),
      }),
    )
    .max(20),
});

export type SaveProductPricingInput = z.input<typeof schema>;

export async function saveProductPricingAction(
  raw: unknown,
): Promise<Result<void, AppError>> {
  const auth = await assertAdmin();
  if (!auth.ok) return err(auth.error);

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return err(
      new ValidationError({
        message: parsed.error.issues[0]?.message ?? "Geçersiz fiyat.",
        details: parsed.error.flatten(),
      }),
    );
  }
  const { product_key, base_price_minor, tiers } = parsed.data;

  const mins = tiers.map((t) => t.min_qty);
  if (new Set(mins).size !== mins.length) {
    return err(
      new ValidationError({ message: "Kademe miktarları benzersiz olmalı." }),
    );
  }

  const baseRes = await updateProductBasePrice(product_key, base_price_minor);
  if (!baseRes.ok) return err(baseRes.error);

  const tiersRes = await replaceProductTiers(product_key, tiers);
  if (!tiersRes.ok) return err(tiersRes.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "product.updated",
    entity_type: "product",
    entity_id: product_key,
    after: { base_price_minor, tier_count: tiers.length },
  });

  revalidatePath("/products");
  revalidatePath("/orders/new");
  return ok(undefined);
}
