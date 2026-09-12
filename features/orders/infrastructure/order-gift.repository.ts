import "server-only";

/**
 * order_gift_items CRUD. The table isn't in the generated Database type yet
 * (added by migration 20260912120000), so the Supabase calls are cast until
 * `pnpm db:types` regenerates — same pattern as saved_locations before it.
 */
import { GIFT_UNIT_LABELS } from "@/features/orders/domain/order-gift";
import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { CreateOrderGiftInput, OrderGiftItem } from "@/features/orders/domain/order-gift";

const GIFT_SELECT = "id, order_id, product_key, quantity, unit_label, note, created_at, products(display_name)";

type EmbeddedProduct = { display_name?: unknown } | Array<{ display_name?: unknown }> | null;

interface GiftRow {
  id: string;
  order_id: string;
  product_key: string;
  quantity: number | string;
  unit_label: string;
  note: string | null;
  created_at: string;
  products: EmbeddedProduct;
}

function isGiftUnitLabel(value: string): value is OrderGiftItem["unit_label"] {
  return (GIFT_UNIT_LABELS as readonly string[]).includes(value);
}

/** Returns null for a row whose shape doesn't hold up at the boundary
 *  (missing joined product, or an unexpected unit_label) rather than
 *  throwing — one bad row shouldn't blank the whole list. */
function rowToGift(row: GiftRow): OrderGiftItem | null {
  const product = Array.isArray(row.products) ? row.products[0] : row.products;
  const displayName = product?.display_name;
  if (typeof displayName !== "string" || !isGiftUnitLabel(row.unit_label)) return null;

  return {
    id: row.id,
    order_id: row.order_id,
    product_key: row.product_key,
    product_display_name: displayName,
    quantity: Number(row.quantity),
    unit_label: row.unit_label,
    note: row.note,
    created_at: new Date(row.created_at),
  };
}

export async function listOrderGifts(
  orderId: string,
): Promise<Result<OrderGiftItem[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("order_gift_items")
    .select(GIFT_SELECT)
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (error) {
    logger.error({ code: error.code, message: error.message }, "list_order_gifts_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const rows = ((data ?? []) as GiftRow[])
    .map(rowToGift)
    .filter((g): g is OrderGiftItem => g !== null);
  return ok(rows);
}

export async function createOrderGift(
  input: CreateOrderGiftInput,
): Promise<Result<OrderGiftItem, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("order_gift_items")
    .insert({
      order_id: input.order_id,
      product_key: input.product_key,
      quantity: input.quantity,
      unit_label: input.unit_label,
      note: input.note,
    })
    .select(GIFT_SELECT)
    .single();

  if (error) {
    logger.error({ code: error.code, message: error.message }, "create_order_gift_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }

  const gift = rowToGift(data as GiftRow);
  if (!gift) {
    return err(new ExternalApiError({ message: "Hediye kaydedildi ama okunamadı." }));
  }
  return ok(gift);
}

export async function deleteOrderGift(id: string): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("order_gift_items").delete().eq("id", id);

  if (error) {
    logger.error({ code: error.code, message: error.message }, "delete_order_gift_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}
