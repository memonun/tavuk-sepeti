import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { OrderStatus, TimeSlot } from "@/features/orders/application/list-orders";

export interface DayOrder {
  readonly order_id: string;
  readonly order_number: string;
  readonly status: OrderStatus;
  readonly scheduled_for: string;
  readonly time_slot: TimeSlot | null;
  readonly customer_id: string;
  readonly customer_first_name: string;
  readonly customer_last_name: string;
  readonly customer_phone: string | null;
  readonly lat: number;
  readonly lng: number;
  /** Açık adres — street line of the address THIS ORDER was placed to. */
  readonly street: string | null;
  /** Bina no on the order's address. */
  readonly building_no: string | null;
  /** Daire / apartment no on the order's address. */
  readonly apartment_no: string | null;
  /**
   * Whether the pin falls inside a configured delivery service area.
   * `null` = no service area configured at all, so the stop is NOT flagged
   * (see is_within_service_area — it is deliberately three-valued).
   */
  readonly in_service_area: boolean | null;
  readonly delivery_notes: string | null;
  readonly total_minor: number;
}

interface RpcRow {
  order_id: string;
  order_number: string;
  status: string;
  scheduled_for: string;
  time_slot: string | null;
  customer_id: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_phone: string | null;
  address_lat: number;
  address_lng: number;
  address_street: string | null;
  address_building_no: string | null;
  address_apartment_no: string | null;
  in_service_area: boolean | null;
  delivery_notes: string | null;
  total_minor: number;
}

/**
 * Fetch the day's route-channel orders together with the address each one was
 * placed to. Calls the `find_orders_for_route` RPC.
 *
 * Since 20260805090600 the RPC joins `orders.address_id` rather than the
 * customer's current primary address, and filters the FROZEN
 * `orders.fulfillment_channel` instead of re-deriving route membership from the
 * live products table — so editing a customer's address no longer silently
 * redirects a pending order, and flipping a product to cargo no longer empties a
 * past route.
 *
 * The RPC isn't yet in the auto-generated Database type (Docker has been
 * down across recent regenerations); we cast `supabase.rpc(...)` until
 * `pnpm db:types` runs again.
 */
export async function getDayOrders(
  targetDate: string,
): Promise<Result<DayOrder[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("find_orders_for_route", {
    target_date: targetDate,
  });

  if (error) {
    logger.error(
      { code: error.code, message: error.message, targetDate },
      "get_day_orders_failed",
    );
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const rows = (data ?? []) as RpcRow[];
  return ok(
    rows.map((row) => ({
      order_id: row.order_id,
      order_number: row.order_number,
      status: row.status as OrderStatus,
      scheduled_for: row.scheduled_for,
      time_slot: row.time_slot as TimeSlot | null,
      customer_id: row.customer_id,
      customer_first_name: row.customer_first_name,
      customer_last_name: row.customer_last_name,
      customer_phone: row.customer_phone,
      lat: row.address_lat,
      lng: row.address_lng,
      street: row.address_street,
      building_no: row.address_building_no,
      apartment_no: row.address_apartment_no,
      in_service_area: row.in_service_area ?? null,
      delivery_notes: row.delivery_notes,
      total_minor: row.total_minor,
    })),
  );
}
