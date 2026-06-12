"use server";

/**
 * Client-callable surface for per-customer pricing. The order form fetches a
 * customer's special prices when the customer is selected. Returns a plain
 * object (serializable across the server-action boundary).
 */
import { getCustomerProductPrices } from "@/features/customers/infrastructure/customer-price.repository";

export async function getCustomerProductPricesAction(
  customerId: string,
): Promise<Record<string, number>> {
  const res = await getCustomerProductPrices(customerId);
  if (!res.ok) return {};
  return Object.fromEntries(res.value.map((e) => [e.product_key, e.unit_price_minor]));
}
