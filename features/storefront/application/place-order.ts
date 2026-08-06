"use server";

/**
 * Storefront checkout. The customer-facing twin of the admin order flow
 * (features/orders/application/create-orders-bulk.ts), and now built on the same
 * contract rather than a parallel one:
 *
 *   1. Zod-parse the payload (CLAUDE.md §4) — first statement, nothing trusted.
 *   2. Resolve the session. An account is required, but it is created or signed
 *      into HERE, in the same submit, so browsing and filling the basket stay
 *      frictionless and no redirect ever strands a full basket.
 *   3. Resolve the customer from the LOGIN. Never by phone — that lookup is what
 *      used to merge web orders onto legacy phone-ordered records.
 *   4. Server-authoritative delivery-date window check.
 *   5. Reload the catalog and re-price EVERY line with enrichOrderItems (the
 *      SAME function the admin path uses). The basket only ever contributes
 *      product_key + quantity; prices are never trusted from the browser.
 *   6. Re-derive the fulfillment channel from the re-priced items and compare it
 *      with the client's hint, so a basket that went stale (an admin flipped a
 *      product to cargo mid-session) is rejected rather than silently switching
 *      channel.
 *   7. Hand to the privileged writer, which re-checks address ownership, the
 *      route-address fields and the service area inside the transaction.
 *
 * Returns a serializable state for useActionState.
 */
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { enrichOrderItems } from "@/features/orders/application/order-item-pricing";
import {
  createPaytrPaymentSession,
  isPaytrEnabled,
} from "@/features/payments/application/paytr";
import { listActiveProducts } from "@/features/products/application/list-products";
import { resolveCheckoutSession } from "@/features/storefront/application/checkout-account";
import { resolveCheckoutCustomer } from "@/features/storefront/application/resolve-checkout-customer";
import { addDaysIso, isWithinWindow } from "@/features/storefront/domain/delivery-date";
import {
  requiredAddressMode,
  resolveOrderChannel,
} from "@/features/storefront/domain/fulfillment-channel";
import { buildOrderConfirmationEmail } from "@/features/storefront/domain/order-email";
import {
  CARGO_FEE_MINOR,
  DELIVERY_FEE_MINOR,
  DELIVERY_PROVINCE,
  MAX_DELIVERY_HORIZON_DAYS,
  MIN_DELIVERY_LEAD_DAYS,
  PAYMENT_METHOD_OPTIONS,
  TIME_SLOT_OPTIONS,
} from "@/features/storefront/domain/storefront.config";
import { webOrderSchema } from "@/features/storefront/domain/web-order.schema";
import { listMyAddresses } from "@/features/storefront/application/list-addresses";
import { placeWebOrder } from "@/features/storefront/infrastructure/web-order.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { sendEmail } from "@/shared/email/send-email";
import { logger } from "@/shared/logger";
import { composeFullAddress } from "@/shared/utils/address";

export type PlaceOrderState =
  | { status: "idle" }
  | { status: "success"; orderNumber: string }
  | { status: "redirect"; url: string }
  /** Signup needs e-mail confirmation before a session exists. Basket kept. */
  | { status: "verify_email"; email: string }
  | { status: "validation_error"; message: string }
  | { status: "error"; message: string };

/** "Today" as a YYYY-MM-DD calendar day in Europe/Istanbul (CLAUDE.md §7). */
function todayInIstanbul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function placeOrderAction(
  _previous: PlaceOrderState,
  formData: FormData,
): Promise<PlaceOrderState> {
  // Cart lines arrive as a JSON string in a hidden field (serialized client
  // side). We only ever read product_key + quantity out of them.
  let itemsRaw: unknown;
  try {
    const raw = formData.get("items_json");
    itemsRaw = typeof raw === "string" ? JSON.parse(raw) : [];
  } catch {
    return { status: "error", message: "Sepet okunamadı, sayfayı yenileyin." };
  }

  const accountMode = String(formData.get("account_mode") ?? "existing");
  const account =
    accountMode === "signup"
      ? {
          mode: "signup",
          email: formData.get("account_email"),
          password: formData.get("account_password"),
          first_name: formData.get("first_name"),
          last_name: formData.get("last_name"),
          phone: formData.get("phone"),
          kvkk_accepted: formData.get("kvkk_accepted") === "on",
        }
      : accountMode === "signin"
        ? {
            mode: "signin",
            email: formData.get("account_email"),
            password: formData.get("account_password"),
          }
        : { mode: "existing" };

  const parsed = webOrderSchema.safeParse({
    account,
    address_id: formData.get("address_id"),
    address_mode: formData.get("address_mode"),
    scheduled_for: formData.get("scheduled_for"),
    time_slot: formData.get("time_slot"),
    payment_method: formData.get("payment_method"),
    delivery_notes: formData.get("delivery_notes"),
    items: itemsRaw,
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      status: "validation_error",
      message: first?.message ?? "Formda eksik veya hatalı alanlar var.",
    };
  }

  // ---- Account (created/signed in inline, so the basket is never lost) ------
  const session = await resolveCheckoutSession(parsed.data.account);
  if (!session.ok) {
    return { status: "validation_error", message: session.error.message };
  }
  if (session.value.kind === "verify_email") {
    return { status: "verify_email", email: session.value.email };
  }
  const { session: identity } = session.value;

  const customer = await resolveCheckoutCustomer(identity);
  if (!customer.ok) {
    if (customer.error.code === "VALIDATION_ERROR") {
      return { status: "validation_error", message: customer.error.message };
    }
    logger.error({ code: customer.error.code }, "checkout_customer_resolve_failed");
    return { status: "error", message: "Hesabınız hazırlanamadı, tekrar deneyin." };
  }

  // ---- Delivery date must fall inside the allowed window -------------------
  // Server-authoritative; the client's <input min/max> is only a convenience.
  const today = todayInIstanbul();
  const earliest = addDaysIso(today, MIN_DELIVERY_LEAD_DAYS);
  const latest = addDaysIso(today, MAX_DELIVERY_HORIZON_DAYS);
  if (!isWithinWindow(parsed.data.scheduled_for, earliest, latest)) {
    return {
      status: "validation_error",
      message: `Teslimat günü ${earliest} ile ${latest} arasında olmalı.`,
    };
  }

  // ---- Authoritative pricing ------------------------------------------------
  // Reload the catalog, re-price + re-validate every line (min_qty + step).
  // Client-sent prices are ignored entirely. Same function as the admin path.
  const catalog = await listActiveProducts();
  if (!catalog.ok) {
    logger.error({ code: catalog.error.code }, "storefront_catalog_load_failed");
    return { status: "error", message: "Ürünler yüklenemedi, tekrar deneyin." };
  }

  const enriched = enrichOrderItems(parsed.data.items, catalog.value);
  if (!enriched.ok) {
    return { status: "validation_error", message: enriched.error.message };
  }

  // ---- Channel: re-derived, never taken from the client ---------------------
  const channel = resolveOrderChannel(enriched.value);
  const requiredMode = requiredAddressMode(enriched.value);
  if (requiredMode !== parsed.data.address_mode) {
    // The basket's nature changed under the customer's feet (e.g. an admin
    // switched a product to cargo while this tab was open). Refuse rather than
    // quietly place an order in the other channel with the wrong address form.
    return {
      status: "validation_error",
      message: "Sepetiniz değişti, sayfayı yenileyip tekrar deneyin.",
    };
  }

  // ---- Address must be one of the account's own ----------------------------
  // The RPC enforces this too (P0004); checking here buys a precise message and
  // gives us the fields for the confirmation e-mail.
  const addresses = await listMyAddresses();
  if (!addresses.ok) {
    logger.error({ code: addresses.error.code }, "checkout_address_load_failed");
    return { status: "error", message: "Adresleriniz yüklenemedi, tekrar deneyin." };
  }
  const address = addresses.value.find((a) => a.id === parsed.data.address_id);
  if (!address) {
    return {
      status: "validation_error",
      message: "Teslimat adresi bulunamadı. Adres seçin veya yeni bir adres ekleyin.",
    };
  }
  if (channel === "delivery" && (address.lat === 0 || address.lng === 0)) {
    return {
      status: "validation_error",
      message: `Taze ürünler için haritadan konum onaylı bir ${DELIVERY_PROVINCE} adresi gerekli.`,
    };
  }

  const deliveryFeeMinor =
    channel === "delivery" ? DELIVERY_FEE_MINOR : CARGO_FEE_MINOR;
  const isCard = parsed.data.payment_method === "credit_card";
  const emailTo = identity.email;

  // Card payments go through PayTR — guard BEFORE creating the order so a
  // misconfigured card path never strands a pending order.
  if (isCard) {
    if (!isPaytrEnabled()) {
      return { status: "error", message: "Kart ile ödeme şu anda kullanılamıyor." };
    }
    if (!emailTo) {
      return {
        status: "validation_error",
        message: "Kart ile ödeme için e-posta adresi gerekli.",
      };
    }
  }

  const placed = await placeWebOrder({
    customerId: customer.value,
    addressId: address.id,
    scheduled_for: parsed.data.scheduled_for,
    // A cargo order has no delivery window — there is no van to schedule.
    time_slot: channel === "delivery" ? parsed.data.time_slot : null,
    payment_method: parsed.data.payment_method,
    delivery_notes: parsed.data.delivery_notes,
    delivery_fee_minor: deliveryFeeMinor,
    items: enriched.value,
  });

  if (!placed.ok) {
    if (placed.error.code === "VALIDATION_ERROR") {
      return { status: "validation_error", message: placed.error.message };
    }
    logger.error({ code: placed.error.code }, "place_web_order_failed");
    return { status: "error", message: "Sipariş oluşturulamadı, tekrar deneyin." };
  }

  logger.info(
    {
      orderNumber: placed.value.order_number,
      source: "customer_web",
      channel: placed.value.fulfillment_channel,
    },
    "web_order_placed",
  );

  // The admin path audits every order; the web path used to audit none.
  await logAudit({
    actor_id: identity.authUserId,
    action: "order.web_placed",
    entity_type: "order",
    entity_id: placed.value.order_id,
    after: {
      order_number: placed.value.order_number,
      scheduled_for: parsed.data.scheduled_for,
      items_count: enriched.value.length,
      payment_method: parsed.data.payment_method,
      fulfillment_channel: placed.value.fulfillment_channel,
    },
  });

  revalidatePath("/hesap");
  revalidatePath("/orders");

  const subtotalMinor = enriched.value.reduce(
    (sum, item) => sum + item.line_total_minor,
    0,
  );
  const totalMinor = subtotalMinor + deliveryFeeMinor;
  const addressText = composeFullAddress(address);
  const customerName = [identity.firstName, identity.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  // ---- Card path → PayTR hosted payment (order stays pending until callback)
  if (isCard && emailTo) {
    const hdrs = await headers();
    const userIp =
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      hdrs.get("x-real-ip") ||
      "0.0.0.0";
    const basket = enriched.value.map((item) => ({
      label: `${item.product_snapshot.display_name} × ${item.quantity.toLocaleString(
        "tr-TR",
        { maximumFractionDigits: 2 },
      )}`,
      totalMinor: item.line_total_minor,
    }));
    if (deliveryFeeMinor > 0) {
      basket.push({
        label: channel === "delivery" ? "Teslimat" : "Kargo",
        totalMinor: deliveryFeeMinor,
      });
    }

    const paytrSession = await createPaytrPaymentSession({
      orderId: placed.value.order_id,
      orderNumber: placed.value.order_number,
      amountMinor: totalMinor,
      email: emailTo,
      userName: customerName || emailTo,
      userAddress: addressText,
      userPhone: identity.phone ?? "",
      userIp,
      basket,
      nowMs: Date.now(),
    });
    if (!paytrSession.ok) {
      logger.error({ code: paytrSession.error.code }, "paytr_session_failed");
      return {
        status: "error",
        message:
          "Ödeme başlatılamadı. Lütfen tekrar deneyin veya başka bir yöntem seçin.",
      };
    }
    return { status: "redirect", url: paytrSession.value.paymentUrl };
  }

  // ---- COD / bank transfer → confirmation email + inline success ------------
  if (emailTo) {
    const email = buildOrderConfirmationEmail({
      orderNumber: placed.value.order_number,
      customerName: customerName || emailTo,
      scheduledFor: parsed.data.scheduled_for,
      timeSlotLabel:
        TIME_SLOT_OPTIONS.find((o) => o.value === parsed.data.time_slot)?.label ??
        null,
      paymentMethodLabel:
        PAYMENT_METHOD_OPTIONS.find((o) => o.value === parsed.data.payment_method)
          ?.label ?? parsed.data.payment_method,
      addressText,
      items: enriched.value.map((item) => ({
        name: item.product_snapshot.display_name,
        quantity: item.quantity,
        lineTotalMinor: item.line_total_minor,
      })),
      subtotalMinor,
      deliveryFeeMinor,
      totalMinor,
    });
    const sent = await sendEmail({
      to: emailTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (!sent.ok) {
      logger.warn({ code: sent.error.code }, "order_confirmation_email_failed");
    }
  }

  return { status: "success", orderNumber: placed.value.order_number };
}
