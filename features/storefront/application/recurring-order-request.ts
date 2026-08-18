"use server";

/**
 * Customer self-service "request a recurring order" — creates an INACTIVE
 * recurring_templates row (source='customer_web') that staff reviews and
 * approves via the existing admin toggle (recurring-template-actions.ts's
 * setRecurringTemplateActiveAction). Mirrors save-address.ts's shape:
 * getCurrentUser → validate/re-derive everything server-side → SECURITY
 * DEFINER writer → logAudit → revalidatePath.
 *
 * Re-derives price, channel and payment-method eligibility exactly like
 * place-order.ts's checkout path (same functions, same order) — a request
 * is not trusted any more than a checkout submission is.
 */
import { revalidatePath } from "next/cache";

import { notifyAdminOfRecurringRequest } from "@/features/admin-notifications/application/notify-admin-recurring-request";
import { getCurrentUser } from "@/features/auth/application/get-session";
import { enrichOrderItems } from "@/features/orders/application/order-item-pricing";
import { firstRunOnOrAfter } from "@/features/recurring/application/next-run";
import { getStorefrontCatalog } from "@/features/storefront/application/get-catalog";
import { getStorefrontSettings } from "@/features/storefront/application/get-storefront-settings";
import { ensureCustomerProfile } from "@/features/storefront/application/ensure-customer-profile";
import { listMyAddresses } from "@/features/storefront/application/list-addresses";
import { addDaysIso } from "@/features/storefront/domain/delivery-date";
import { formatHomeDeliveryDays, isWeekday } from "@/features/storefront/domain/delivery-window";
import { resolveOrderChannel } from "@/features/storefront/domain/fulfillment-channel";
import {
  paymentMethodBlockedMessage,
  paymentMethodsForChannel,
  type PaymentMethod,
} from "@/features/storefront/domain/payment-options";
import { recurringRequestSchema } from "@/features/storefront/domain/recurring-request.schema";
import { isRouteUpgradeEligible } from "@/features/storefront/domain/route-capability";
import { MIN_DELIVERY_LEAD_DAYS } from "@/features/storefront/domain/storefront.config";
import {
  cancelCustomerRecurringTemplate,
  createCustomerRecurringTemplate,
} from "@/features/storefront/infrastructure/customer-recurring.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { logger } from "@/shared/logger";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { todayInIstanbul } from "@/shared/utils/date";

export type RecurringOrderRequestState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "validation_error"; message: string }
  | { status: "error"; message: string };

export async function createRecurringOrderRequestAction(
  raw: unknown,
): Promise<RecurringOrderRequestState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }
  await ensureCustomerProfile();

  const parsed = recurringRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "validation_error",
      message: parsed.error.issues[0]?.message ?? "Geçersiz talep.",
    };
  }
  const p = parsed.data;

  // ---- Authoritative item validation — never trust the client's list ----
  const catalog = await getStorefrontCatalog();
  if (!catalog.ok) {
    logger.error({ code: catalog.error.code }, "recurring_request_catalog_failed");
    return { status: "error", message: "Ürünler yüklenemedi, tekrar deneyin." };
  }
  const enriched = enrichOrderItems(p.items, catalog.value);
  if (!enriched.ok) {
    return { status: "validation_error", message: enriched.error.message };
  }

  // ---- Address: must have a primary, route-aware channel derived from it ----
  const addresses = await listMyAddresses();
  if (!addresses.ok) {
    logger.error({ code: addresses.error.code }, "recurring_request_address_failed");
    return { status: "error", message: "Adresleriniz yüklenemedi, tekrar deneyin." };
  }
  const primaryAddress = addresses.value.find((a) => a.is_primary);
  if (!primaryAddress) {
    return {
      status: "validation_error",
      message: "Önce hesabınıza bir teslimat adresi ekleyin.",
    };
  }

  const channel = resolveOrderChannel(
    enriched.value,
    isRouteUpgradeEligible(primaryAddress),
  );

  if (!paymentMethodsForChannel(channel).some((o) => o.value === p.payment_method)) {
    return {
      status: "validation_error",
      message: paymentMethodBlockedMessage(p.payment_method as PaymentMethod),
    };
  }

  // ---- Day: always constrained to the live eve-servis days, regardless of
  // channel — a shipping-resolving basket has no van-day constraint, but
  // there's no upside to letting it pick an off day either, and this keeps
  // the form's day picker unconditional. ----
  const settings = await getStorefrontSettings();
  if (!isWeekday(p.day_of_week) || !settings.homeDeliveryDays.includes(p.day_of_week)) {
    return {
      status: "validation_error",
      message: `Eve servis günlerimiz: ${formatHomeDeliveryDays(settings.homeDeliveryDays)}. Lütfen bu günlerden birini seçin.`,
    };
  }

  const startYmd = addDaysIso(todayInIstanbul(), MIN_DELIVERY_LEAD_DAYS);
  const nextRunAt = firstRunOnOrAfter(startYmd, p.cadence, {
    dayOfWeek: p.day_of_week,
  });

  const created = await createCustomerRecurringTemplate({
    authUserId: user.id,
    cadence: p.cadence,
    dayOfWeek: p.day_of_week,
    items: p.items,
    paymentMethod: p.payment_method,
    nextRunAt,
  });
  if (!created.ok) {
    if (created.error.code === "VALIDATION_ERROR") {
      return { status: "validation_error", message: created.error.message };
    }
    logger.error({ code: created.error.code }, "recurring_request_create_failed");
    return { status: "error", message: "Talep kaydedilemedi, tekrar deneyin." };
  }

  await logAudit({
    actor_id: user.id,
    action: "recurring.requested",
    entity_type: "recurring_template",
    entity_id: created.value,
    after: { cadence: p.cadence, day_of_week: p.day_of_week, item_count: p.items.length },
  });

  await notifyAdminOfRecurringRequest(created.value);

  revalidatePath("/duzenli-siparis");
  return { status: "success" };
}

export async function cancelMyRecurringOrderAction(
  templateId: string,
): Promise<RecurringOrderRequestState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Oturum bulunamadı, tekrar giriş yapın." };
  }

  const cancelled = await cancelCustomerRecurringTemplate(user.id, templateId);
  if (!cancelled.ok) {
    if (cancelled.error.code === "VALIDATION_ERROR") {
      return { status: "validation_error", message: cancelled.error.message };
    }
    logger.error({ code: cancelled.error.code }, "recurring_request_cancel_failed");
    return { status: "error", message: "İptal edilemedi, tekrar deneyin." };
  }

  await logAudit({
    actor_id: user.id,
    action: "recurring.request_cancelled",
    entity_type: "recurring_template",
    entity_id: templateId,
  });

  revalidatePath("/duzenli-siparis");
  return { status: "success" };
}

// ---------------------------------------------------------------------------
// Read: the signed-in customer's own templates
// ---------------------------------------------------------------------------

export interface MyRecurringTemplateView {
  id: string;
  cadence: "weekly" | "biweekly" | "monthly";
  day_of_week: number | null;
  day_of_month: number | null;
  item_count: number;
  active: boolean;
  approved_at: string | null;
  cancelled_at: string | null;
  next_run_at: string;
}

export async function listMyRecurringTemplatesAction(): Promise<
  MyRecurringTemplateView[]
> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createSupabaseServerClient();
  // recurring_templates isn't in the generated Database type yet — same
  // un-generated-table cast the rest of this table's callers use.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("recurring_templates")
    .select(
      "id, cadence, day_of_week, day_of_month, items, active, approved_at, cancelled_at, next_run_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    logger.warn({ code: error.code }, "list_my_recurring_templates_failed");
    return [];
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    cadence: row.cadence as "weekly" | "biweekly" | "monthly",
    day_of_week: typeof row.day_of_week === "number" ? row.day_of_week : null,
    day_of_month: typeof row.day_of_month === "number" ? row.day_of_month : null,
    item_count: Array.isArray(row.items) ? row.items.length : 0,
    active: Boolean(row.active),
    approved_at: typeof row.approved_at === "string" ? row.approved_at : null,
    cancelled_at: typeof row.cancelled_at === "string" ? row.cancelled_at : null,
    next_run_at: String(row.next_run_at),
  }));
}
