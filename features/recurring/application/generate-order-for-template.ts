import "server-only";

/**
 * Pure per-template order generation step.
 *
 * Builds priced line items for a single `RecurringTemplate` (applying
 * any per-customer price overrides), then calls the idempotent
 * `create_recurring_order` RPC via the repository layer.
 *
 * Cross-feature imports go through application/ only (ESLint boundaries).
 */
import { enrichOrderItems } from "@/features/orders/application/order-item-pricing";
import { createRecurringOrder } from "@/features/recurring/infrastructure/recurring-template.repository";
import type { Product } from "@/features/products/application/list-products";
import { ValidationError, ExternalApiError } from "@/shared/errors/app-error";
import { err, type Result } from "@/shared/result";

import type { RecurringTemplate } from "@/features/recurring/domain/recurring-template";

export async function generateOrderForTemplate(
  template: RecurringTemplate,
  products: ReadonlyArray<Product>,
  overrides: Record<string, number>,
  scheduledForYmd: string,
  createdBy: string | null,
): Promise<Result<{ order_id: string }, ValidationError | ExternalApiError>> {
  // Build priced inputs respecting exactOptionalPropertyTypes:
  // only include unit_price_minor when an override is present.
  const withPrices = template.items.map((item) => {
    const ov = overrides[item.product_key];
    return ov != null
      ? { product_key: item.product_key, quantity: item.quantity, unit_price_minor: ov }
      : { product_key: item.product_key, quantity: item.quantity };
  });

  const enriched = enrichOrderItems(withPrices, products);
  if (!enriched.ok) {
    return err(
      new ValidationError({ message: `${template.id}: ${enriched.error.message}` }),
    );
  }

  return createRecurringOrder({
    template_id: template.id,
    scheduled_for: scheduledForYmd,
    created_by: createdBy,
    items: enriched.value,
  });
}
