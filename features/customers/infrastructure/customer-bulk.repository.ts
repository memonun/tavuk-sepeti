import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export async function getCustomerProductPricesBatch(
  customerIds: string[],
): Promise<
  Result<
    Array<{ customer_id: string; product_key: string; unit_price_minor: number }>,
    ExternalApiError
  >
> {
  if (customerIds.length === 0) return ok([]);
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("customer_product_prices")
    .select("customer_id, product_key, unit_price_minor")
    .in("customer_id", customerIds);
  if (error) {
    logger.error(
      { count: customerIds.length, code: error.code },
      "get_customer_prices_batch_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(
    (
      (data ?? []) as Array<{
        customer_id: string;
        product_key: string;
        unit_price_minor: number | string;
      }>
    ).map((r) => ({
      customer_id: r.customer_id,
      product_key: r.product_key,
      unit_price_minor: Number(r.unit_price_minor),
    })),
  );
}

export async function getCustomersMissingPrimaryAddress(
  customerIds: string[],
): Promise<Result<string[], ExternalApiError>> {
  if (customerIds.length === 0) return ok([]);
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("addresses")
    .select("customer_id")
    .eq("is_primary", true)
    .in("customer_id", customerIds);
  if (error) {
    logger.error(
      { count: customerIds.length, code: error.code },
      "get_customers_missing_address_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  const withAddress = new Set(
    ((data ?? []) as Array<{ customer_id: string }>).map((r) => r.customer_id),
  );
  return ok(customerIds.filter((id) => !withAddress.has(id)));
}
