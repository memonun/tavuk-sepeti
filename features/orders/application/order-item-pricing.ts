/**
 * Shared pricing & validation helpers for order line items.
 *
 * Extracted from create-order.ts so the same enrich+validate logic
 * can be reused by updateOrderAction (which needs frozen prices for
 * items already on the order) without duplicating the step/min-qty
 * checks.
 */
import { ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import type { Product } from "@/features/products/application/list-products";

export interface EnrichedOrderItem {
  product_key: string;
  quantity: number;
  unit_price_minor: number;
  product_snapshot: {
    display_name: string;
    unit: string;
    unit_label: string;
  };
}

/**
 * True when `quantity` is an integer multiple of `step`.
 * Uses scaled-integer math so 0.5 + 0.5 + ... doesn't drift.
 * Scale = 100 (2 decimal places maximum precision).
 */
export function isMultipleOfStep(quantity: number, step: number): boolean {
  const scale = 100;
  return Math.round(quantity * scale) % Math.round(step * scale) === 0;
}

/**
 * Validate and enrich a list of raw order item inputs against the
 * active product catalog.
 *
 * @param items     Raw items (product_key + quantity, optionally unit_price_minor).
 * @param products  Active catalog — fetched once by the caller.
 * @param frozen    Optional map of product_key → frozen price + snapshot.
 *                  Used when re-editing an existing order so we don't
 *                  override the price that was locked at create time.
 *                  New product_keys (not in frozen) fall back to the
 *                  catalog price.
 *
 * Returns `ok(EnrichedOrderItem[])` or `err(ValidationError)` on the
 * first failing item.
 */
export function enrichOrderItems(
  items: ReadonlyArray<{
    product_key: string;
    quantity: number;
    unit_price_minor?: number | undefined;
  }>,
  products: ReadonlyArray<Product>,
  frozen?: ReadonlyMap<
    string,
    {
      unit_price_minor: number;
      product_snapshot: EnrichedOrderItem["product_snapshot"];
    }
  >,
): Result<EnrichedOrderItem[], ValidationError> {
  const productByKey = new Map(products.map((p) => [p.key, p]));
  const enriched: EnrichedOrderItem[] = [];

  for (const item of items) {
    const product = productByKey.get(item.product_key);
    if (!product) {
      return err(
        new ValidationError({ message: `Ürün bulunamadı: ${item.product_key}` }),
      );
    }

    if (item.quantity < product.min_qty) {
      return err(
        new ValidationError({
          message: `${product.display_name}: minimum ${product.min_qty} ${product.unit_label} gerekli.`,
        }),
      );
    }

    if (!isMultipleOfStep(item.quantity, product.step)) {
      return err(
        new ValidationError({
          message: `${product.display_name}: miktar ${product.step} ${product.unit_label} katı olmalı.`,
        }),
      );
    }

    const frozenEntry = frozen?.get(item.product_key);

    const unit_price_minor =
      frozenEntry?.unit_price_minor ??
      item.unit_price_minor ??
      product.current_unit_price_minor;

    const product_snapshot =
      frozenEntry?.product_snapshot ?? {
        display_name: product.display_name,
        unit: product.unit,
        unit_label: product.unit_label,
      };

    enriched.push({
      product_key: item.product_key,
      quantity: item.quantity,
      unit_price_minor,
      product_snapshot,
    });
  }

  return ok(enriched);
}
