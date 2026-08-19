import "server-only";

/**
 * Read one order by its number plus the phone recorded on it.
 *
 * A guest has no /hesap, so without this their order number is a dead end: they
 * cannot see whether the order is paid and — after the resume-payment work —
 * cannot reach "Ödemeyi tamamla" when a card payment falls through. That dead
 * end is what drove customers to place duplicate orders instead.
 *
 * Order numbers are sequential (ORD-2026-00475), so the number alone is
 * guessable; the PHONE is what makes scanning them useless. The RPC returns
 * status fields only — never the address, the items or the name — so even a
 * correct guess of both discloses very little.
 *
 * Runs on the service-role client because `orders` has no policy for `anon`,
 * and the authorization is the phone match inside the RPC rather than RLS.
 */
import { isAwaitingCardConfirmation } from "@/features/storefront/domain/card-confirmation";
import { AppError, ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { getSupabaseAdminClient } from "@/shared/supabase/admin";
import { normalizeTRPhone } from "@/shared/utils/phone";

export interface GuestOrderView {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  totalMinor: number;
  scheduledFor: string;
  channel: "delivery" | "shipping";
  createdAt: string;
  cargoCarrier: string | null;
  cargoTrackingNumber: string | null;
  cargoTrackingUrl: string | null;
  /** Dwell-aware ETA from the admin's route-optimization flow
   *  (features/routing/domain/route-schedule.ts) — a flat estimate, not live
   *  tracking. Null until the order has been through an optimized route at
   *  least once, and always null for `channel === "shipping"` (cargo orders
   *  never go through /routes). */
  estimatedDeliveryAt: string | null;
  /**
   * Whether this order's card payment might still be in flight, evaluated when
   * the lookup ran.
   *
   * Derived here rather than in the component because the storefront's lookup
   * card is a Client Component: reading the clock during its render is impure,
   * and the compiler may re-render it at will. The value is a snapshot of the
   * moment the customer asked — which is exactly the moment it describes.
   */
  awaitingCardConfirmation: boolean;
}

/** Shared row→view mapping for every RPC that returns this same column set
 *  (lookup_guest_order, lookup_guest_orders_by_details). */
export function mapGuestOrderRow(row: Record<string, unknown>): GuestOrderView {
  const createdAt = String(row.created_at);
  return {
    awaitingCardConfirmation: isAwaitingCardConfirmation(
      {
        payment_status: String(row.payment_status),
        payment_method: String(row.payment_method),
        status: String(row.status),
        created_at: createdAt,
      },
      new Date().getTime(),
    ),
    orderId: String(row.order_id),
    orderNumber: String(row.order_number),
    status: String(row.status),
    paymentStatus: String(row.payment_status),
    paymentMethod: String(row.payment_method),
    totalMinor: Number(row.total_minor ?? 0),
    scheduledFor: String(row.scheduled_for),
    channel: row.fulfillment_channel === "shipping" ? "shipping" : "delivery",
    createdAt,
    cargoCarrier: typeof row.cargo_carrier === "string" ? row.cargo_carrier : null,
    cargoTrackingNumber:
      typeof row.cargo_tracking_number === "string" ? row.cargo_tracking_number : null,
    cargoTrackingUrl:
      typeof row.cargo_tracking_url === "string" ? row.cargo_tracking_url : null,
    estimatedDeliveryAt:
      typeof row.estimated_delivery_at === "string" ? row.estimated_delivery_at : null,
  };
}

/** Null = no order matches that number/phone pair. Deliberately indistinguishable
 *  from "wrong phone" so the lookup cannot confirm an order exists. */
export async function lookupGuestOrder(
  orderNumber: string,
  phone: string,
): Promise<Result<GuestOrderView | null, AppError>> {
  const normalizedPhone = normalizeTRPhone(phone);
  if (!normalizedPhone || orderNumber.trim() === "") return ok(null);

  const supabase = getSupabaseAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("lookup_guest_order", {
    p_order_number: orderNumber.trim(),
    p_phone: normalizedPhone,
  });

  if (error) {
    logger.error({ code: error.code }, "lookup_guest_order_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | Record<string, unknown>
    | null
    | undefined;
  if (!row?.order_id) return ok(null);

  return ok(mapGuestOrderRow(row));
}
