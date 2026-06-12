"use server";

/**
 * Order payment actions — record/remove payments and the "mark fully paid"
 * shortcut. The DB triggers recompute the order's amount_paid + derived
 * payment_status, so these just write the ledger and revalidate.
 */
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { getOrderById } from "@/features/orders/application/get-order";
import { addPaymentSchema } from "@/features/orders/domain/payment";
import {
  deletePayment,
  insertPayment,
  listPaymentsForOrder,
} from "@/features/orders/infrastructure/order-payment.repository";
import { logAudit } from "@/shared/audit/log-audit";

import type { OrderPayment, PaymentChannel } from "@/features/orders/domain/payment";

/** Client-callable fetch for the grid detail Sheet (server-only repo wrapper). */
export async function getOrderPaymentsAction(
  orderId: string,
): Promise<OrderPayment[]> {
  const res = await listPaymentsForOrder(orderId);
  return res.ok ? res.value : [];
}

export type PaymentActionState =
  | { status: "success" }
  | { status: "error"; message: string };

function normalizePaidAt(s?: string): string {
  if (!s) return new Date().toISOString();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export async function addPaymentAction(
  raw: unknown,
): Promise<PaymentActionState> {
  const parsed = addPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Geçersiz ödeme.",
    };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  const { order_id, amount_minor, channel, paid_at, note } = parsed.data;
  const res = await insertPayment({
    order_id,
    amount_minor,
    channel,
    paid_at: normalizePaidAt(paid_at),
    note: note ?? null,
    created_by: user.id,
  });
  if (!res.ok) return { status: "error", message: res.error.message };

  await logAudit({
    actor_id: user.id,
    action: "payment.recorded",
    entity_type: "order",
    entity_id: order_id,
    after: { amount_minor, channel },
  });
  revalidatePath("/orders");
  revalidatePath(`/orders/${order_id}`);
  return { status: "success" };
}

export async function markOrderFullyPaidAction(input: {
  order_id: string;
  channel?: PaymentChannel;
}): Promise<PaymentActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  const orderRes = await getOrderById(input.order_id);
  if (!orderRes.ok) return { status: "error", message: orderRes.error.message };
  const order = orderRes.value;

  const balance = order.total_minor - order.amount_paid_minor;
  if (balance <= 0) return { status: "success" }; // already settled

  const channel: PaymentChannel =
    input.channel ??
    (order.payment_method === "bank_transfer" ? "bank_transfer" : "cash");

  const res = await insertPayment({
    order_id: order.id,
    amount_minor: balance,
    channel,
    paid_at: new Date().toISOString(),
    note: null,
    created_by: user.id,
  });
  if (!res.ok) return { status: "error", message: res.error.message };

  await logAudit({
    actor_id: user.id,
    action: "payment.recorded",
    entity_type: "order",
    entity_id: order.id,
    after: { amount_minor: balance, channel, shortcut: "full" },
  });
  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  return { status: "success" };
}

export async function deletePaymentAction(input: {
  payment_id: string;
  order_id: string;
}): Promise<PaymentActionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }
  const res = await deletePayment(input.payment_id);
  if (!res.ok) return { status: "error", message: res.error.message };

  await logAudit({
    actor_id: user.id,
    action: "payment.deleted",
    entity_type: "order",
    entity_id: input.order_id,
  });
  revalidatePath("/orders");
  revalidatePath(`/orders/${input.order_id}`);
  return { status: "success" };
}
