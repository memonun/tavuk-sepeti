/**
 * Persistence for storefront checkout.
 *
 * Calls the `place_web_order` RPC (SECURITY DEFINER; service_role-only) via the
 * service-role client for atomicity: order + items + initial status event in one
 * transaction. This is the sanctioned use of the admin client — a system-internal
 * write on behalf of a customer who has no table-write policy of their own
 * (shared/supabase/admin.ts).
 *
 * Since migration 20260805090500 the RPC takes a customer id and an address id
 * rather than a name/phone/email tuple. That is the parity fix: the web writer
 * now has the same precondition as `create_order_with_items` ("an existing
 * customer with an existing address") and shares its `address_snapshot()`, so an
 * admin order and a web order for the same inputs produce the same row.
 *
 * The item shape is declared structurally here (not imported from the orders
 * feature) so this infrastructure module stays within its import boundary
 * (infrastructure → own domain + shared only). The application layer passes the
 * orders feature's EnrichedOrderItem, which is structurally compatible.
 */
import "server-only";

import {
  AppError,
  ExternalApiError,
  ValidationError,
} from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";

export interface WebOrderRepoItem {
  product_key: string;
  quantity: number;
  unit_price_minor: number;
  line_total_minor: number;
  product_snapshot: { display_name: string; unit: string; unit_label: string };
}

export interface WebOrderRepoInput {
  /** Resolved from the LOGIN by resolve-checkout-customer. Never from a phone. */
  customerId: string;
  /** One of that customer's own addresses. The RPC re-checks ownership. */
  addressId: string;
  scheduled_for: string;
  time_slot: "morning" | "afternoon" | "evening" | null;
  payment_method: "cash_on_delivery" | "bank_transfer" | "credit_card";
  delivery_notes: string | null;
  delivery_fee_minor: number;
  items: ReadonlyArray<WebOrderRepoItem>;
}

export interface WebOrderResult {
  order_id: string;
  order_number: string;
  fulfillment_channel: "delivery" | "shipping";
}

/** Turkish messages for the RPC's guard codes — see migration 20260805090500. */
const GUARD_MESSAGES: Readonly<Record<string, string>> = {
  P0002: "Hesabınız bulunamadı. Sayfayı yenileyip tekrar deneyin.",
  P0004: "Bu adres hesabınıza ait değil.",
  P0006: "Teslimat adresinde açık adres ve daire no eksik.",
  P0007: "Bu adres teslimat bölgemizin dışında.",
};

export async function placeWebOrder(
  input: WebOrderRepoInput,
): Promise<Result<WebOrderResult, AppError>> {
  const supabase = getSupabaseAdminClient();

  // The RPC isn't in the generated Database type (added by migration, not yet
  // regenerated) — mirror the codebase's un-generated-RPC cast pattern.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("place_web_order", {
    p_customer_id: input.customerId,
    p_address_id: input.addressId,
    p_scheduled_for: input.scheduled_for,
    p_time_slot: input.time_slot,
    p_payment_method: input.payment_method,
    p_delivery_notes: input.delivery_notes,
    p_delivery_fee_minor: input.delivery_fee_minor,
    p_items: input.items,
  });

  if (error) {
    const guard = typeof error.code === "string" ? GUARD_MESSAGES[error.code] : undefined;
    if (guard) {
      // Expected, user-actionable states — warn, don't error-page.
      logger.warn({ code: error.code }, "place_web_order_rejected");
      return err(new ValidationError({ message: guard }));
    }
    logger.error(
      { code: error.code, message: error.message },
      "place_web_order_rpc_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { order_id?: string; order_number?: string; fulfillment_channel?: string }
    | null
    | undefined;

  if (!row?.order_id || !row?.order_number) {
    logger.error({}, "place_web_order_rpc_no_row");
    return err(new ExternalApiError({ message: "Sipariş kimliği alınamadı." }));
  }

  return ok({
    order_id: String(row.order_id),
    order_number: String(row.order_number),
    fulfillment_channel:
      row.fulfillment_channel === "shipping" ? "shipping" : "delivery",
  });
}

/** The address a guest typed into the checkout, already validated. */
export interface GuestAddressPayload {
  label: string | null;
  raw_text: string;
  description: string | null;
  city: string;
  district: string;
  neighborhood: string;
  street: string;
  building_no: string;
  apartment_no: string;
  postal_code: string;
  lat: number;
  lng: number;
  source: string;
  accuracy: string;
  geo_verified: boolean;
}

export interface GuestOrderRepoInput
  extends Omit<WebOrderRepoInput, "customerId" | "addressId"> {
  first_name: string;
  last_name: string;
  phone: string;
  /** Optional — `place_guest_order` stores null as-is (customers.email is
   *  nullable), and the caller has already refused a card payment with no
   *  email before this is ever called. */
  email: string | null;
  address: GuestAddressPayload;
}

/**
 * Place an order for a visitor with no account.
 *
 * `place_guest_order` mints the `customers` and `addresses` rows and then calls
 * `place_web_order` itself, so this is still ONE order-writing path — and the
 * whole thing is one transaction, meaning a rejected order (bad address, outside
 * the area) leaves no orphan customer behind.
 *
 * It never looks anything up: a repeat guest gets a NEW customers row rather
 * than being matched onto an existing one. That is the owner's standing rule for
 * web-originated records, and matching by phone is precisely what the previous
 * guest writer did wrong — it attached web orders to legacy phone customers.
 */
export async function placeGuestOrder(
  input: GuestOrderRepoInput,
): Promise<Result<WebOrderResult, AppError>> {
  const supabase = getSupabaseAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("place_guest_order", {
    p_first_name: input.first_name,
    p_last_name: input.last_name,
    p_phone: input.phone,
    p_email: input.email,
    p_address: input.address,
    p_scheduled_for: input.scheduled_for,
    p_time_slot: input.time_slot,
    p_payment_method: input.payment_method,
    p_delivery_notes: input.delivery_notes,
    p_delivery_fee_minor: input.delivery_fee_minor,
    p_items: input.items,
  });

  if (error) {
    // P0008 is this writer's own guard; the rest bubble up from place_web_order.
    const guard =
      typeof error.code === "string"
        ? error.code === "P0008"
          ? "Telefon numarası gerekli."
          : GUARD_MESSAGES[error.code]
        : undefined;
    if (guard) {
      logger.warn({ code: error.code }, "place_guest_order_rejected");
      return err(new ValidationError({ message: guard }));
    }
    logger.error(
      { code: error.code, message: error.message },
      "place_guest_order_rpc_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { order_id?: string; order_number?: string; fulfillment_channel?: string }
    | null
    | undefined;

  if (!row?.order_id || !row?.order_number) {
    logger.error({}, "place_guest_order_rpc_no_row");
    return err(new ExternalApiError({ message: "Sipariş kimliği alınamadı." }));
  }

  return ok({
    order_id: String(row.order_id),
    order_number: String(row.order_number),
    fulfillment_channel:
      row.fulfillment_channel === "shipping" ? "shipping" : "delivery",
  });
}
