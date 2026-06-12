/**
 * Shared pricing & validation helpers for order line items.
 *
 * Pricing for an editable order is always computed from CURRENT pricing:
 * an explicit per-line price (the "Özel fiyat" field — a per-customer special
 * price) wins; otherwise the product's volume tiers / flat base apply. There
 * is no per-line price freezing — what the editor previews is exactly what is
 * saved, and the stored total always reflects current pricing. (Delivered /
 * cancelled orders are immutable, so they keep their last-saved figures.)
 *
 * The line total is exact (round once); the unit price is the rounded
 * per-unit figure stored for the record.
 */
import { priceOrderLine } from "@/features/products/application/pricing";
import { ValidationError } from "@/shared/errors/app-error";
import { err, ok, type Result } from "@/shared/result";

import type { Product } from "@/features/products/application/list-products";

export interface EnrichedOrderItem {
  product_key: string;
  quantity: number;
  unit_price_minor: number;
  line_total_minor: number;
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
 * Validate and enrich a list of raw order item inputs against the active
 * product catalog, computing each line's price from its (optional) special
 * price or the product's tiers.
 */
export function enrichOrderItems(
  items: ReadonlyArray<{
    product_key: string;
    quantity: number;
    /** Explicit special price (kuruş) for this line — overrides tiers. */
    unit_price_minor?: number | undefined;
  }>,
  products: ReadonlyArray<Product>,
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

    const priced = priceOrderLine(item.quantity, {
      tiers: product.price_tiers,
      basePriceMinor: product.current_unit_price_minor,
      overrideUnitPriceMinor: item.unit_price_minor,
    });

    enriched.push({
      product_key: item.product_key,
      quantity: item.quantity,
      unit_price_minor: priced.unit_price_minor,
      line_total_minor: priced.line_total_minor,
      product_snapshot: {
        display_name: product.display_name,
        unit: product.unit,
        unit_label: product.unit_label,
      },
    });
  }

  return ok(enriched);
}
