"use server";

/**
 * Save a product's pricing: its flat/base unit price, its optional sale price
 * ("indirimli fiyat") + its volume tiers.
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
  /** Sale price per unit: a number sets it, null clears it, omitted keeps it
   *  (so the MCP pricing tool never wipes a sale it doesn't know about). */
  discount_unit_price_minor: z.coerce
    .number()
    .int("İndirimli fiyat kuruş cinsinden tam sayı olmalı.")
    .positive("İndirimli fiyat sıfırdan büyük olmalı.")
    .nullable()
    .optional(),
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
  const { product_key, base_price_minor, discount_unit_price_minor, tiers } =
    parsed.data;

  if (discount_unit_price_minor != null && discount_unit_price_minor >= base_price_minor) {
    return err(
      new ValidationError({
        message: "İndirimli fiyat, normal birim fiyattan düşük olmalı.",
      }),
    );
  }

  const mins = tiers.map((t) => t.min_qty);
  if (new Set(mins).size !== mins.length) {
    return err(
      new ValidationError({ message: "Kademe miktarları benzersiz olmalı." }),
    );
  }

  const baseRes = await updateProductBasePrice(
    product_key,
    base_price_minor,
    discount_unit_price_minor,
  );
  if (!baseRes.ok) return err(baseRes.error);

  const tiersRes = await replaceProductTiers(product_key, tiers);
  if (!tiersRes.ok) return err(tiersRes.error);

  await logAudit({
    actor_id: auth.value.id,
    action: "product.updated",
    entity_type: "product",
    entity_id: product_key,
    after: {
      base_price_minor,
      ...(discount_unit_price_minor !== undefined ? { discount_unit_price_minor } : {}),
      tier_count: tiers.length,
    },
  });

  revalidatePath("/products");
  revalidatePath("/orders/new");
  return ok(undefined);
}
