"use server";

/**
 * Guest storefront checkout (Faz 2). Mirrors the admin order flow
 * (features/orders/application/create-order.ts) but for an anonymous customer:
 *
 *   1. Zod-parse the checkout payload (webOrderSchema) — first line, no trust.
 *   2. Server-authoritative delivery-date window check.
 *   3. Reload the catalog and re-price EVERY line with enrichOrderItems — the
 *      client's basket only contributes product_key + quantity; prices are
 *      never trusted from the browser.
 *   4. Best-effort geocode of the typed address (never blocks checkout).
 *   5. Hand to the privileged writer (place_web_order RPC).
 *
 * Returns a serializable state for useActionState.
 */
import { headers } from "next/headers";

import { getCurrentUser } from "@/features/auth/application/get-session";
import { geocodeAddress } from "@/features/geocoding/application/geocode-address";
import { enrichOrderItems } from "@/features/orders/application/order-item-pricing";
import {
  createPaytrPaymentSession,
  isPaytrEnabled,
} from "@/features/payments/application/paytr";
import { listActiveProducts } from "@/features/products/application/list-products";
import { addDaysIso, isWithinWindow } from "@/features/storefront/domain/delivery-date";
import { buildOrderConfirmationEmail } from "@/features/storefront/domain/order-email";
import {
  DELIVERY_FEE_MINOR,
  MAX_DELIVERY_HORIZON_DAYS,
  MIN_DELIVERY_LEAD_DAYS,
  PAYMENT_METHOD_OPTIONS,
  TIME_SLOT_OPTIONS,
} from "@/features/storefront/domain/storefront.config";
import { webOrderSchema } from "@/features/storefront/domain/web-order.schema";
import { placeWebOrder } from "@/features/storefront/infrastructure/web-order.repository";
import { sendEmail } from "@/shared/email/send-email";
import {
  composeFullAddress,
  composeGeocoderQuery,
  hasGeocodableShape,
} from "@/shared/utils/address";
import { logger } from "@/shared/logger";
import { isErr } from "@/shared/result";

export type PlaceOrderState =
  | { status: "idle" }
  | { status: "success"; orderNumber: string }
  | { status: "redirect"; url: string }
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
  // Cart lines arrive as a JSON string in a hidden field (serialized client-
  // side). We only ever read product_key + quantity out of them.
  let itemsRaw: unknown;
  try {
    const raw = formData.get("items_json");
    itemsRaw = typeof raw === "string" ? JSON.parse(raw) : [];
  } catch {
    return { status: "error", message: "Sepet okunamadı, sayfayı yenileyin." };
  }

  const parsed = webOrderSchema.safeParse({
    contact: {
      first_name: formData.get("first_name"),
      last_name: formData.get("last_name"),
      phone: formData.get("phone"),
      email: formData.get("email"),
    },
    address: {
      city: formData.get("city"),
      district: formData.get("district"),
      neighborhood: formData.get("neighborhood"),
      street: formData.get("street"),
      building_no: formData.get("building_no"),
      apartment_no: formData.get("apartment_no"),
      postal_code: formData.get("postal_code"),
      description: formData.get("description"),
    },
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

  // Delivery date must fall inside the allowed window (server-authoritative;
  // the client's <input min/max> is only a convenience).
  const today = todayInIstanbul();
  const earliest = addDaysIso(today, MIN_DELIVERY_LEAD_DAYS);
  const latest = addDaysIso(today, MAX_DELIVERY_HORIZON_DAYS);
  if (!isWithinWindow(parsed.data.scheduled_for, earliest, latest)) {
    return {
      status: "validation_error",
      message: `Teslimat günü ${earliest} ile ${latest} arasında olmalı.`,
    };
  }

  // Authoritative pricing: reload catalog, re-price + re-validate every line
  // (min_qty + step). Client-sent prices are ignored entirely.
  const catalog = await listActiveProducts();
  if (!catalog.ok) {
    logger.error({ code: catalog.error.code }, "storefront_catalog_load_failed");
    return { status: "error", message: "Ürünler yüklenemedi, tekrar deneyin." };
  }

  const enriched = enrichOrderItems(parsed.data.items, catalog.value);
  if (!enriched.ok) {
    return { status: "validation_error", message: enriched.error.message };
  }

  // Optional login: attach the order to the account when signed in (null =
  // guest). The RPC reuses/links the customer by this id.
  const user = await getCurrentUser();
  const authUserId = user?.id ?? null;
  const emailTo = parsed.data.contact.email ?? user?.email ?? null;
  const isCard = parsed.data.payment_method === "credit_card";

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

  // Best-effort geocode. A missing Google key or a low-accuracy result does NOT
  // block the order — it's placed with the typed address snapshot and the admin
  // can drop the pin later. A good pin lets the RPC create the customer's
  // address row so routing/map work with zero admin effort.
  const addr = parsed.data.address;
  let coords:
    | { lat: number; lng: number; source: string; accuracy: string }
    | null = null;
  if (hasGeocodableShape(addr)) {
    const geo = await geocodeAddress(composeGeocoderQuery(addr));
    if (isErr(geo)) {
      logger.warn(
        { code: geo.error.code },
        "storefront_geocode_failed_continuing",
      );
    } else {
      coords = {
        lat: geo.value.lat,
        lng: geo.value.lng,
        source: geo.value.source,
        accuracy: geo.value.accuracy,
      };
    }
  }

  const placed = await placeWebOrder({
    contact: {
      first_name: parsed.data.contact.first_name,
      last_name: parsed.data.contact.last_name,
      phone: parsed.data.contact.phone,
      email: parsed.data.contact.email,
    },
    address: {
      raw_text: composeFullAddress(addr),
      description: addr.description ?? null,
      city: addr.city,
      district: addr.district,
      neighborhood: addr.neighborhood,
      street: addr.street,
      building_no: addr.building_no,
      apartment_no: addr.apartment_no,
      postal_code: addr.postal_code,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      source: coords?.source ?? null,
      accuracy: coords?.accuracy ?? null,
    },
    scheduled_for: parsed.data.scheduled_for,
    time_slot: parsed.data.time_slot,
    payment_method: parsed.data.payment_method,
    delivery_notes: parsed.data.delivery_notes,
    delivery_fee_minor: DELIVERY_FEE_MINOR,
    items: enriched.value,
    authUserId,
  });

  if (!placed.ok) {
    logger.error({ code: placed.error.code }, "place_web_order_failed");
    return { status: "error", message: "Sipariş oluşturulamadı, tekrar deneyin." };
  }

  logger.info(
    { orderNumber: placed.value.order_number, source: "customer_web" },
    "web_order_placed",
  );

  const subtotalMinor = enriched.value.reduce(
    (sum, item) => sum + item.line_total_minor,
    0,
  );
  const totalMinor = subtotalMinor + DELIVERY_FEE_MINOR;

  // ---- Card path → PayTR hosted payment (order stays pending until callback).
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
    if (DELIVERY_FEE_MINOR > 0) {
      basket.push({ label: "Teslimat", totalMinor: DELIVERY_FEE_MINOR });
    }

    const session = await createPaytrPaymentSession({
      orderId: placed.value.order_id,
      orderNumber: placed.value.order_number,
      amountMinor: totalMinor,
      email: emailTo,
      userName:
        `${parsed.data.contact.first_name} ${parsed.data.contact.last_name}`.trim(),
      userAddress: composeFullAddress(addr),
      userPhone: parsed.data.contact.phone,
      userIp,
      basket,
      nowMs: Date.now(),
    });
    if (!session.ok) {
      logger.error({ code: session.error.code }, "paytr_session_failed");
      return {
        status: "error",
        message:
          "Ödeme başlatılamadı. Lütfen tekrar deneyin veya başka bir yöntem seçin.",
      };
    }
    return { status: "redirect", url: session.value.paymentUrl };
  }

  // ---- COD / bank transfer → confirmation email + inline success ----------
  if (emailTo) {
    const email = buildOrderConfirmationEmail({
      orderNumber: placed.value.order_number,
      customerName:
        `${parsed.data.contact.first_name} ${parsed.data.contact.last_name}`.trim(),
      scheduledFor: parsed.data.scheduled_for,
      timeSlotLabel:
        TIME_SLOT_OPTIONS.find((o) => o.value === parsed.data.time_slot)?.label ??
        null,
      paymentMethodLabel:
        PAYMENT_METHOD_OPTIONS.find((o) => o.value === parsed.data.payment_method)
          ?.label ?? parsed.data.payment_method,
      addressText: composeFullAddress(addr),
      items: enriched.value.map((item) => ({
        name: item.product_snapshot.display_name,
        quantity: item.quantity,
        lineTotalMinor: item.line_total_minor,
      })),
      subtotalMinor,
      deliveryFeeMinor: DELIVERY_FEE_MINOR,
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
