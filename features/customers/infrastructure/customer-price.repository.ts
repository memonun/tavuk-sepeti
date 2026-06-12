import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export interface CustomerProductPrice {
  product_key: string;
  unit_price_minor: number;
}

// `customer_product_prices` isn't in the generated Database type yet, so these
// use the un-generated-table cast pattern used elsewhere in the codebase.

export async function getCustomerProductPrices(
  customerId: string,
): Promise<Result<CustomerProductPrice[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("customer_product_prices")
    .select("product_key, unit_price_minor")
    .eq("customer_id", customerId);
  if (error) {
    logger.error({ customerId, code: error.code }, "get_customer_prices_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(
    ((data ?? []) as Array<{ product_key: string; unit_price_minor: number | string }>).map(
      (r) => ({ product_key: r.product_key, unit_price_minor: Number(r.unit_price_minor) }),
    ),
  );
}

export async function upsertCustomerProductPrices(
  customerId: string,
  entries: ReadonlyArray<CustomerProductPrice>,
): Promise<Result<void, ExternalApiError>> {
  if (entries.length === 0) return ok(undefined);
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("customer_product_prices").upsert(
    entries.map((e) => ({
      customer_id: customerId,
      product_key: e.product_key,
      unit_price_minor: e.unit_price_minor,
      updated_at: now,
    })),
    { onConflict: "customer_id,product_key" },
  );
  if (error) {
    logger.error({ customerId, code: error.code }, "upsert_customer_prices_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

export async function deleteCustomerProductPrices(
  customerId: string,
  productKeys: ReadonlyArray<string>,
): Promise<Result<void, ExternalApiError>> {
  if (productKeys.length === 0) return ok(undefined);
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("customer_product_prices")
    .delete()
    .eq("customer_id", customerId)
    .in("product_key", [...productKeys]);
  if (error) {
    logger.error({ customerId, code: error.code }, "delete_customer_prices_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}
