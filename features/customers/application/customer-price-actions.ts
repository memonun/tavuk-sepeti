"use server";

/**
 * Client-callable surface for per-customer pricing. The order form fetches a
 * customer's special prices when the customer is selected. Returns a plain
 * object (serializable across the server-action boundary).
 */
import { getCustomerProductPrices } from "@/features/customers/infrastructure/customer-price.repository";
import {
  getCustomerProductPricesBatch,
  getCustomersMissingPrimaryAddress,
} from "@/features/customers/infrastructure/customer-bulk.repository";

export async function getCustomerProductPricesAction(
  customerId: string,
): Promise<Record<string, number>> {
  const res = await getCustomerProductPrices(customerId);
  if (!res.ok) return {};
  return Object.fromEntries(res.value.map((e) => [e.product_key, e.unit_price_minor]));
}

export async function getCustomerProductPricesBatchAction(
  customerIds: string[],
): Promise<
  Array<{ customer_id: string; product_key: string; unit_price_minor: number }>
> {
  const res = await getCustomerProductPricesBatch(customerIds);
  return res.ok ? res.value : [];
}

export async function getCustomersMissingPrimaryAddressAction(
  customerIds: string[],
): Promise<string[]> {
  const res = await getCustomersMissingPrimaryAddress(customerIds);
  // On query failure, be conservative: treat none as "missing" here and let the
  // RPC's own guard reject any address-less customer at commit (defense in depth).
  return res.ok ? res.value : [];
}
