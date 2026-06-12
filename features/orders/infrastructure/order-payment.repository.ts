import "server-only";

import { ExternalApiError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "@/shared/supabase/server";

import type { OrderPayment, PaymentChannel } from "@/features/orders/domain/payment";

// `order_payments` isn't in the generated Database type yet — these use the
// un-generated-table cast pattern used elsewhere. The order's amount_paid +
// payment_status are kept in sync by DB triggers, so these are plain writes.

interface PaymentRow {
  id: string;
  order_id: string;
  amount_minor: number | string;
  channel: string;
  paid_at: string;
  note: string | null;
  created_at: string;
}

function rowToPayment(r: PaymentRow): OrderPayment {
  return {
    id: r.id,
    order_id: r.order_id,
    amount_minor: Number(r.amount_minor),
    channel: r.channel as PaymentChannel,
    paid_at: new Date(r.paid_at),
    note: r.note ?? null,
    created_at: new Date(r.created_at),
  };
}

export async function listPaymentsForOrder(
  orderId: string,
): Promise<Result<OrderPayment[], ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("order_payments")
    .select("id, order_id, amount_minor, channel, paid_at, note, created_at")
    .eq("order_id", orderId)
    .order("paid_at", { ascending: true });
  if (error) {
    logger.error({ orderId, code: error.code }, "list_payments_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(((data ?? []) as PaymentRow[]).map(rowToPayment));
}

export interface InsertPaymentInput {
  order_id: string;
  amount_minor: number;
  channel: PaymentChannel;
  paid_at: string; // ISO
  note: string | null;
  created_by: string;
}

export async function insertPayment(
  input: InsertPaymentInput,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("order_payments").insert({
    order_id: input.order_id,
    amount_minor: input.amount_minor,
    channel: input.channel,
    paid_at: input.paid_at,
    note: input.note,
    created_by: input.created_by,
  });
  if (error) {
    logger.error({ orderId: input.order_id, code: error.code }, "insert_payment_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}

export async function deletePayment(
  paymentId: string,
): Promise<Result<void, ExternalApiError>> {
  const supabase = await createSupabaseServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("order_payments")
    .delete()
    .eq("id", paymentId);
  if (error) {
    logger.error({ paymentId, code: error.code }, "delete_payment_failed");
    return err(new ExternalApiError({ message: error.message, cause: error }));
  }
  return ok(undefined);
}
