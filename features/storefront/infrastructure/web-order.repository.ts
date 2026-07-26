/**
 * Persistence for guest storefront checkout.
 *
 * Calls the `place_web_order` RPC (SECURITY DEFINER; service_role-only) via the
 * service-role client for atomicity: customer find-or-create, optional address,
 * order + items + initial status event in one transaction. This is the
 * sanctioned use of the admin client — a system-internal write on behalf of no
 * signed-in user (shared/supabase/admin.ts). The customer never touches a table
 * directly, and prices were already frozen from the catalog by the caller.
 *
 * The item shape is declared structurally here (not imported from the orders
 * feature) so this infrastructure module stays within its import boundary
 * (infrastructure → own domain + shared only). The application layer passes the
 * orders feature's EnrichedOrderItem, which is structurally compatible.
 */
import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
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
  contact: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string | null;
  };
  address: {
    raw_text: string;
    description: string | null;
    city: string;
    district: string;
    neighborhood: string;
    street: string;
    building_no: string;
    apartment_no: string;
    postal_code: string;
    lat: number | null;
    lng: number | null;
    source: string | null;
    accuracy: string | null;
  };
  scheduled_for: string;
  time_slot: "morning" | "afternoon" | "evening" | null;
  payment_method: "cash_on_delivery" | "bank_transfer";
  delivery_notes: string | null;
  delivery_fee_minor: number;
  items: ReadonlyArray<WebOrderRepoItem>;
  /** Logged-in customer's auth user id, or null for guest checkout. */
  authUserId: string | null;
}

export interface WebOrderResult {
  order_id: string;
  order_number: string;
}

export async function placeWebOrder(
  input: WebOrderRepoInput,
): Promise<Result<WebOrderResult, ExternalApiError>> {
  const supabase = getSupabaseAdminClient();

  const pAddress = {
    raw_text: input.address.raw_text,
    description: input.address.description,
    city: input.address.city,
    district: input.address.district,
    neighborhood: input.address.neighborhood,
    street: input.address.street,
    building_no: input.address.building_no,
    apartment_no: input.address.apartment_no,
    postal_code: input.address.postal_code,
    lat: input.address.lat,
    lng: input.address.lng,
    source: input.address.source,
    accuracy: input.address.accuracy,
  };

  // The RPC isn't in the generated Database type (added by the storefront
  // migration, not yet regenerated) — mirror the codebase's un-generated-RPC
  // cast pattern (see order.repository.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("place_web_order", {
    p_first_name: input.contact.first_name,
    p_last_name: input.contact.last_name,
    p_phone: input.contact.phone,
    p_email: input.contact.email,
    p_address: pAddress,
    p_scheduled_for: input.scheduled_for,
    p_time_slot: input.time_slot,
    p_payment_method: input.payment_method,
    p_delivery_notes: input.delivery_notes,
    p_delivery_fee_minor: input.delivery_fee_minor,
    p_items: input.items,
    p_auth_user_id: input.authUserId,
  });

  if (error) {
    logger.error(
      { code: error.code, message: error.message },
      "place_web_order_rpc_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { order_id?: string; order_number?: string }
    | null
    | undefined;

  if (!row?.order_id || !row?.order_number) {
    logger.error({}, "place_web_order_rpc_no_row");
    return err(new ExternalApiError({ message: "Sipariş kimliği alınamadı." }));
  }

  return ok({
    order_id: String(row.order_id),
    order_number: String(row.order_number),
  });
}
