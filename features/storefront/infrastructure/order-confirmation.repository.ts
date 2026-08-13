/**
 * Reads everything the order-confirmation e-mail needs in ONE query
 * (CLAUDE.md §9 — no N+1): the order, its frozen delivery-address snapshot,
 * its line items and the customer's name + e-mail.
 *
 * Uses the service-role client because the caller is the PayTR webhook, which
 * runs on behalf of no signed-in user and so carries no RLS session — the same
 * sanctioned admin-client use as the payment writer next to it.
 *
 * The row is Zod-parsed rather than cast (CLAUDE.md §3/§4): `delivery_address_
 * snapshot` and `product_snapshot` are jsonb, i.e. an external boundary the
 * generated types only describe as `Json`.
 */
import "server-only";

import { z } from "zod";

import { ExternalApiError, NotFoundError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";
import { composeFullAddress } from "@/shared/utils/address";

const addressSnapshotSchema = z
  .object({
    city: z.string().nullish(),
    district: z.string().nullish(),
    neighborhood: z.string().nullish(),
    street: z.string().nullish(),
    building_no: z.string().nullish(),
    apartment_no: z.string().nullish(),
    postal_code: z.string().nullish(),
  })
  .catchall(z.unknown())
  // A malformed snapshot must not cost the customer their receipt.
  .catch({});

const customerSchema = z.object({
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  email: z.string().nullish(),
});

const rowSchema = z.object({
  order_number: z.string(),
  scheduled_for: z.string(),
  // Frozen on the row by the writer. Decides whether the e-mail promises a
  // delivery day or says the parcel ships when ready.
  fulfillment_channel: z.enum(["delivery", "shipping"]).catch("delivery"),
  time_slot: z.string().nullable(),
  payment_method: z.string(),
  subtotal_minor: z.coerce.number(),
  delivery_fee_minor: z.coerce.number(),
  total_minor: z.coerce.number(),
  delivery_address_snapshot: addressSnapshotSchema,
  // PostgREST returns a to-one embed as an object; tolerate an array.
  customers: z.union([customerSchema, z.array(customerSchema)]).nullable(),
  order_items: z.array(
    z.object({
      quantity: z.coerce.number(),
      line_total_minor: z.coerce.number(),
      product_snapshot: z
        .object({ display_name: z.string().catch("") })
        .catchall(z.unknown())
        .catch({ display_name: "" }),
    }),
  ),
});

export interface OrderConfirmationLine {
  readonly name: string;
  readonly quantity: number;
  readonly lineTotalMinor: number;
}

export interface OrderConfirmationSnapshot {
  readonly orderNumber: string;
  /** null when the customer record carries no e-mail — nothing to send to. */
  readonly customerEmail: string | null;
  readonly customerName: string;
  readonly channel: "delivery" | "shipping";
  readonly scheduledFor: string;
  /** Raw enum value; the application layer maps it to a Turkish label. */
  readonly timeSlot: string | null;
  readonly paymentMethod: string;
  readonly addressText: string;
  readonly items: ReadonlyArray<OrderConfirmationLine>;
  readonly subtotalMinor: number;
  readonly deliveryFeeMinor: number;
  readonly totalMinor: number;
}

export async function getOrderConfirmationSnapshot(
  orderId: string,
): Promise<Result<OrderConfirmationSnapshot, ExternalApiError | NotFoundError>> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `order_number, scheduled_for, time_slot, payment_method, fulfillment_channel,
       subtotal_minor, delivery_fee_minor, total_minor,
       delivery_address_snapshot,
       customers ( first_name, last_name, email ),
       order_items ( quantity, line_total_minor, product_snapshot )`,
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    logger.error({ orderId, code: error.code }, "order_confirmation_fetch_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  if (!data) return err(new NotFoundError({ message: "Sipariş bulunamadı." }));

  const parsed = rowSchema.safeParse(data);
  if (!parsed.success) {
    logger.error({ orderId }, "order_confirmation_row_unparsable");
    return err(
      new ExternalApiError({ message: "Sipariş verisi okunamadı.", cause: parsed.error }),
    );
  }

  const row = parsed.data;
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  const customerName = [customer?.first_name, customer?.last_name]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();

  return ok({
    orderNumber: row.order_number,
    customerEmail: customer?.email ?? null,
    customerName,
    channel: row.fulfillment_channel,
    scheduledFor: row.scheduled_for,
    timeSlot: row.time_slot,
    paymentMethod: row.payment_method,
    addressText: composeFullAddress(row.delivery_address_snapshot),
    items: row.order_items.map((item) => ({
      name: item.product_snapshot.display_name,
      quantity: item.quantity,
      lineTotalMinor: item.line_total_minor,
    })),
    subtotalMinor: row.subtotal_minor,
    deliveryFeeMinor: row.delivery_fee_minor,
    totalMinor: row.total_minor,
  });
}
