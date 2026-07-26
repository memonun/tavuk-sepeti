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
import { geocodeAddress } from "@/features/geocoding/application/geocode-address";
import { enrichOrderItems } from "@/features/orders/application/order-item-pricing";
import { listActiveProducts } from "@/features/products/application/list-products";
import { addDaysIso, isWithinWindow } from "@/features/storefront/domain/delivery-date";
import {
  DELIVERY_FEE_MINOR,
  MAX_DELIVERY_HORIZON_DAYS,
  MIN_DELIVERY_LEAD_DAYS,
} from "@/features/storefront/domain/storefront.config";
import { webOrderSchema } from "@/features/storefront/domain/web-order.schema";
import { placeWebOrder } from "@/features/storefront/infrastructure/web-order.repository";
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
  });

  if (!placed.ok) {
    logger.error({ code: placed.error.code }, "place_web_order_failed");
    return { status: "error", message: "Sipariş oluşturulamadı, tekrar deneyin." };
  }

  logger.info(
    { orderNumber: placed.value.order_number, source: "customer_web" },
    "web_order_placed",
  );
  return { status: "success", orderNumber: placed.value.order_number };
}
