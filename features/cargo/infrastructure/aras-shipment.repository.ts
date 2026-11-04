import "server-only";

/**
 * Reads and writes for sending a cargo order to Aras Kargo. Same data-coupling
 * posture as cargo-recipients.repository.ts: `orders` / `customers` columns
 * are read through the shared schema, not through another feature's code.
 * The Aras columns aren't in the generated Supabase types yet, hence the
 * untyped client; every row is Zod-parsed before use.
 */
import { z } from "zod";

import { ExternalApiError, NotFoundError, type AppError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export const ARAS_CARRIER_NAME = "Aras Kargo";

const customerSchema = z.object({
  first_name: z.unknown(),
  last_name: z.unknown(),
  phone: z.unknown(),
});

const sourceRowSchema = z.object({
  order_number: z.string(),
  status: z.string(),
  fulfillment_channel: z.string(),
  delivery_address_snapshot: z.unknown(),
  aras_integration_code: z.string().nullable(),
  // PostgREST returns the embedded to-one as an object, but tolerate an array.
  customers: z.union([customerSchema, z.array(customerSchema).min(1)]),
});

export interface ArasShipmentSource {
  readonly orderNumber: string;
  readonly status: string;
  readonly fulfillmentChannel: string;
  readonly snapshot: unknown;
  readonly arasIntegrationCode: string | null;
  readonly firstName: unknown;
  readonly lastName: unknown;
  readonly phone: unknown;
}

export async function fetchArasShipmentSource(
  orderId: string,
): Promise<Result<ArasShipmentSource, AppError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("orders")
    .select(
      "order_number, status, fulfillment_channel, delivery_address_snapshot, aras_integration_code, customers!inner(first_name, last_name, phone)",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    logger.error({ orderId, code: error.code }, "aras_source_lookup_failed");
    return err(new ExternalApiError({ message: "Sipariş okunamadı.", cause: error }));
  }
  if (!data) return err(new NotFoundError({ message: "Sipariş bulunamadı." }));

  const row = sourceRowSchema.safeParse(data);
  if (!row.success) {
    logger.error({ orderId }, "aras_source_row_invalid");
    return err(new ExternalApiError({ message: "Sipariş verisi okunamadı." }));
  }
  const customer = Array.isArray(row.data.customers)
    ? row.data.customers[0]
    : row.data.customers;

  return ok({
    orderNumber: row.data.order_number,
    status: row.data.status,
    fulfillmentChannel: row.data.fulfillment_channel,
    snapshot: row.data.delivery_address_snapshot,
    arasIntegrationCode: row.data.aras_integration_code,
    firstName: customer?.first_name,
    lastName: customer?.last_name,
    phone: customer?.phone,
  });
}

/**
 * Record a successful SetOrder: the Aras code, when it was sent, the carrier
 * name and — when we know our tracking account — the tracking link, so the
 * customer's order page shows it without anyone typing it in.
 */
export async function markOrderSentToAras(input: {
  orderId: string;
  integrationCode: string;
  trackingUrl: string | null;
}): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  const update: Record<string, string> = {
    aras_integration_code: input.integrationCode,
    aras_sent_at: new Date().toISOString(),
    cargo_carrier: ARAS_CARRIER_NAME,
  };
  if (input.trackingUrl) update.cargo_tracking_url = input.trackingUrl;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("orders").update(update).eq("id", input.orderId);
  if (error) {
    logger.error({ orderId: input.orderId, code: error.code }, "aras_mark_sent_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

/** The Aras code of an order, or null if it was never sent to Aras. */
export async function findArasIntegrationCode(
  orderId: string,
): Promise<Result<string | null, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("orders")
    .select("aras_integration_code")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    logger.error({ orderId, code: error.code }, "aras_code_lookup_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  const code = (data as { aras_integration_code?: unknown } | null)?.aras_integration_code;
  return ok(typeof code === "string" ? code : null);
}
