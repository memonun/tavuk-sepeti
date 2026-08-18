"use server";

/**
 * Storefront checkout. The customer-facing twin of the admin order flow
 * (features/orders/application/create-orders-bulk.ts), and now built on the same
 * contract rather than a parallel one:
 *
 *   1. Zod-parse the payload (CLAUDE.md §4) — first statement, nothing trusted.
 *   2. Resolve WHO is ordering. Two shapes, normalised into one `actor`:
 *        - account — identity comes from the session (normally established one
 *          step earlier by `createCheckoutAccountAction`, since an address
 *          cannot be saved without one); the signup/signin branches stay
 *          reachable here so a stale tab posting the old single-submit shape
 *          still works.
 *        - guest — identity AND address travel with this submit: there is no
 *          session to read and no address book to pick from. `place_guest_order`
 *          mints both rows in the same transaction as the order.
 *      Never resolved by phone — that lookup is what used to merge web orders
 *      onto legacy phone-ordered records.
 *   3. Reload the catalog and re-price EVERY line with enrichOrderItems (the
 *      SAME function the admin path uses). The basket only ever contributes
 *      product_key + quantity; prices are never trusted from the browser.
 *   4. Re-derive the ADDRESS FORM mode from the re-priced items and compare it
 *      with the client's hint, so a basket that went stale (an admin flipped a
 *      product to cargo mid-session) is rejected rather than silently
 *      switching form shape.
 *   5. Re-derive the fulfillment CHANNEL — address-aware since 2026-08-13 for a
 *      SIGNED-IN customer: a flexible-only basket still becomes `delivery` when
 *      their saved address is route-capable (isRouteUpgradeEligible), same
 *      "ride along in the van" treatment a mixed basket already gets. Mirrors
 *      resolve_channel_for_items() in the RPC (migration 20260813130000) — the
 *      two must land on the same channel or the checks below would validate
 *      against one the write then disagrees with. A GUEST has no saved address
 *      to check yet (theirs arrives typed, further down, WITH this submit), so
 *      their channel stays cart-only — the same behaviour as before this date.
 *   6. Apply the CHANNEL-DEPENDENT rules, all server-authoritative and all
 *      re-checked here even though the form already renders them:
 *        - delivery → the day must be inside the window AND one of the owner's
 *          "eve servis günleri" (storefront_settings), and the basket must
 *          clear the eve-servis order floor (250 ₺ by default);
 *        - shipping → no preparation day is asked for at all; the earliest
 *          allowed day is stamped on the order, and the basket must clear the
 *          cargo order floor (1.000 ₺ by default);
 *        - kapıda nakit ödeme only on a delivery — a courier collects nothing
 *          on our behalf.
 *   7. Resolve WHERE it goes. An account's address was already fetched in step
 *      5; a guest's is validated now, against the channel just derived (route
 *      schema demands a confirmed pin, cargo does not).
 *   8. Hand to the privileged writer, which re-checks address ownership, the
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
import {
  readCheckoutAccountInput,
  resolveCheckoutSession,
} from "@/features/storefront/application/checkout-account";
import { getStorefrontSettings } from "@/features/storefront/application/get-storefront-settings";
import { resolveCheckoutCustomer } from "@/features/storefront/application/resolve-checkout-customer";
import {
  validateCheckoutAddress,
  type CheckoutAddress,
} from "@/features/storefront/application/validate-checkout-address";
import { addDaysIso, isWithinWindow } from "@/features/storefront/domain/delivery-date";
import {
  formatHomeDeliveryDays,
  isHomeDeliveryDay,
} from "@/features/storefront/domain/delivery-window";
import {
  requiredAddressMode,
  resolveOrderChannel,
} from "@/features/storefront/domain/fulfillment-channel";
import {
  checkOrderMinimum,
  orderMinimumMessage,
} from "@/features/storefront/domain/order-minimum";
import {
  BANK_TRANSFER_ACCOUNT_HOLDER,
  BANK_TRANSFER_BANK_NAME,
  BANK_TRANSFER_IBAN,
  buildBankTransferWhatsAppLink,
} from "@/features/storefront/domain/bank-transfer";
import { buildOrderConfirmationEmail } from "@/features/storefront/domain/order-email";
import {
  isPaymentMethodAllowed,
  paymentMethodBlockedMessage,
  type PaymentMethod,
} from "@/features/storefront/domain/payment-options";
import { isRouteUpgradeEligible } from "@/features/storefront/domain/route-capability";
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
import {
  listMyAddresses,
  type SavedAddress,
} from "@/features/storefront/application/list-addresses";
import {
  placeGuestOrder,
  placeWebOrder,
  type GuestAddressPayload,
} from "@/features/storefront/infrastructure/web-order.repository";
import { logAudit } from "@/shared/audit/log-audit";
import { sendEmail } from "@/shared/email/send-email";
import { logger } from "@/shared/logger";
import { composeFullAddress } from "@/shared/utils/address";

export type PlaceOrderState =
  | { status: "idle" }
  | {
      status: "success";
      orderNumber: string;
      paymentMethod: PaymentMethod;
      totalMinor: number;
      /** Did a confirmation e-mail go out? False for a guest who left the
       *  (optional) e-mail field blank — the confirmation screen wording
       *  depends on it. */
      hasEmail: boolean;
    }
  | { status: "redirect"; url: string }
  /** Signup needs e-mail confirmation before a session exists. Basket kept. */
  | { status: "verify_email"; email: string }
  /** The session died between rendering the form and submitting it. Distinct
   *  from a validation error because the recovery is "sign in again", and the
   *  form has to offer it — a red line alone left the customer clicking a still
   *  enabled button under a greeting with their own name on it. */
  | { status: "session_expired"; message: string }
  | { status: "validation_error"; message: string }
  | { status: "error"; message: string };

/**
 * The address a guest typed, straight off the FormData.
 *
 * Returns `unknown` on purpose — `validateCheckoutAddress` runs the real schema
 * over it (CLAUDE.md §4: nothing from a form is trusted before Zod). The `addr_`
 * prefix keeps these from colliding with the account block's own field names.
 */
function readGuestAddressInput(formData: FormData): unknown {
  const str = (key: string): string => {
    const value = formData.get(`addr_${key}`);
    return typeof value === "string" ? value : "";
  };
  return {
    label: str("label"),
    city: str("city"),
    district: str("district"),
    neighborhood: str("neighborhood"),
    street: str("street"),
    building_no: str("building_no"),
    apartment_no: str("apartment_no"),
    postal_code: str("postal_code"),
    description: str("description"),
    lat: str("lat"),
    lng: str("lng"),
    source: str("source") || "user_pin",
    accuracy: str("accuracy") || "unknown",
  };
}

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

  const parsed = webOrderSchema.safeParse({
    account: readCheckoutAccountInput(formData),
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

  // ---- Who is ordering -------------------------------------------------------
  // Two shapes, normalised into one `actor` so everything downstream — pricing,
  // PayTR, the confirmation e-mail — stays single-path.
  //
  //   account — identity comes from the session, and the address was saved
  //             beforehand (it needs a session), so the order references it by id.
  //   guest   — identity AND address travel with this submit: there is no session
  //             to read and no address book to pick from. `place_guest_order`
  //             mints both rows in the same transaction as the order.
  const guestAccount =
    parsed.data.account.mode === "guest" ? parsed.data.account : null;

  let actor: {
    authUserId: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  };
  /** Resolved up front for an account; minted by the RPC for a guest. */
  let customerId: string | null = null;

  if (guestAccount) {
    actor = {
      authUserId: null,
      email: guestAccount.email,
      firstName: guestAccount.first_name,
      lastName: guestAccount.last_name,
      phone: guestAccount.phone,
    };
  } else {
    const session = await resolveCheckoutSession(parsed.data.account, {
      nextPath: "/odeme",
    });
    if (!session.ok) {
      if (session.error.code === "UNAUTHORIZED") {
        return { status: "session_expired", message: session.error.message };
      }
      return { status: "validation_error", message: session.error.message };
    }
    if (session.value.kind === "verify_email") {
      return { status: "verify_email", email: session.value.email };
    }
    if (session.value.kind === "email_taken") {
      // Only reachable from a stale tab still holding the old single-submit form;
      // the account step handles this inline. Name the control either way.
      return {
        status: "validation_error",
        message:
          'Bu e-posta ile bir hesap var. "Zaten hesabım var" ile giriş yapın.',
      };
    }

    const customer = await resolveCheckoutCustomer(session.value.session);
    if (!customer.ok) {
      if (customer.error.code === "VALIDATION_ERROR") {
        return { status: "validation_error", message: customer.error.message };
      }
      logger.error({ code: customer.error.code }, "checkout_customer_resolve_failed");
      return { status: "error", message: "Hesabınız hazırlanamadı, tekrar deneyin." };
    }
    actor = session.value.session;
    customerId = customer.value;
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

  // ---- Address mode: cart-only, unchanged by the address-aware channel below.
  // A basket that went stale (an admin flipped a product to cargo mid-session)
  // is rejected rather than silently switching form shape.
  const requiredMode = requiredAddressMode(enriched.value);
  if (requiredMode !== parsed.data.address_mode) {
    return {
      status: "validation_error",
      message: "Sepetiniz değişti, sayfayı yenileyip tekrar deneyin.",
    };
  }

  // ---- An account's saved address, fetched early ----------------------------
  // Needed here (ahead of the channel-dependent rules below) because the
  // channel itself now needs it for the address-aware upgrade — see
  // resolveOrderChannel next. The RPC enforces ownership too (P0004); checking
  // here buys a precise message and gives us the fields for the confirmation
  // e-mail. A guest has no book yet: theirs is typed WITH this submit and is
  // validated further down, once the channel it needs to match is known.
  let accountAddress: SavedAddress | null = null;
  if (!guestAccount) {
    const addresses = await listMyAddresses();
    if (!addresses.ok) {
      logger.error({ code: addresses.error.code }, "checkout_address_load_failed");
      return { status: "error", message: "Adresleriniz yüklenemedi, tekrar deneyin." };
    }
    const saved = addresses.value.find((a) => a.id === parsed.data.address_id);
    if (!saved) {
      return {
        status: "validation_error",
        message: "Teslimat adresi bulunamadı. Adres seçin veya yeni bir adres ekleyin.",
      };
    }
    accountAddress = saved;
  }

  // ---- Channel: re-derived, never taken from the client ----------------------
  // Owner decision 2026-08-13: a flexible-only basket (no delivery-only line)
  // still becomes a delivery order when a SIGNED-IN customer's address is
  // genuinely route-capable — same "ride along in the van" treatment a mixed
  // basket already gets. This must land on exactly the same channel
  // resolve_channel_for_items() decides in the RPC (migration 20260813130000),
  // or the checks below (payment method, order floor) would validate against a
  // channel the write then disagrees with. A guest's basket stays cart-only —
  // their address is not on file yet to check.
  const channel = resolveOrderChannel(
    enriched.value,
    accountAddress ? isRouteUpgradeEligible(accountAddress) : false,
  );

  // ---- Rules the owner controls (delivery days, order floor) ----------------
  const settings = await getStorefrontSettings();
  const subtotalMinor = enriched.value.reduce(
    (sum, item) => sum + item.line_total_minor,
    0,
  );

  // ---- Scheduling: server-authoritative, and channel-dependent --------------
  // A delivery order books a van, so it needs a day the van actually drives.
  // A cargo order books nothing: the owner asked that the "hazırlanma günü"
  // question be dropped for out-of-city parcels, so the earliest allowed day is
  // stamped on the order (the column is NOT NULL and the ops lists sort by it)
  // and the parcel ships when it is ready.
  const today = todayInIstanbul();
  const earliest = addDaysIso(today, MIN_DELIVERY_LEAD_DAYS);
  const latest = addDaysIso(today, MAX_DELIVERY_HORIZON_DAYS);
  let scheduledFor = earliest;

  if (channel === "delivery") {
    const requested = parsed.data.scheduled_for;
    if (requested === null) {
      return { status: "validation_error", message: "Teslimat günü seçin." };
    }
    if (!isWithinWindow(requested, earliest, latest)) {
      return {
        status: "validation_error",
        message: `Teslimat günü ${earliest} ile ${latest} arasında olmalı.`,
      };
    }
    if (!isHomeDeliveryDay(requested, settings.homeDeliveryDays)) {
      return {
        status: "validation_error",
        message: `Eve servis günlerimiz: ${formatHomeDeliveryDays(
          settings.homeDeliveryDays,
        )}. Lütfen bu günlerden birini seçin.`,
      };
    }
    scheduledFor = requested;
  }

  // ---- Order floor, whichever one applies to this channel -------------------
  // Checked against the RE-PRICED subtotal, never the browser's arithmetic.
  const minOrderMinor =
    channel === "delivery" ? settings.homeMinOrderMinor : settings.cargoMinOrderMinor;
  const minimum = checkOrderMinimum(subtotalMinor, minOrderMinor);
  if (!minimum.ok) {
    return {
      status: "validation_error",
      message: orderMinimumMessage(channel, minOrderMinor, minimum.shortfallMinor),
    };
  }

  // ---- Payment method must be legal for this channel ------------------------
  // Kapıda nakit ödeme is home-delivery only: our driver can take cash at the
  // door, a cargo courier collects nothing on our behalf.
  if (!isPaymentMethodAllowed(parsed.data.payment_method, channel)) {
    return {
      status: "validation_error",
      message: paymentMethodBlockedMessage(parsed.data.payment_method),
    };
  }

  // ---- Where it goes ---------------------------------------------------------
  // An account's address was already fetched above; a guest's arrives WITH this
  // submit and is validated now, against the channel just derived — a route
  // order must carry a confirmed pin inside the service area, a cargo parcel
  // may go anywhere in Türkiye.
  let address: CheckoutAddress;
  let guestAddress: GuestAddressPayload | null = null;
  let accountAddressId: string | null = null;

  if (guestAccount) {
    const validated = await validateCheckoutAddress(
      channel === "delivery" ? "route" : "cargo",
      readGuestAddressInput(formData),
    );
    if (!validated.ok) {
      return { status: "validation_error", message: validated.error.message };
    }
    address = validated.value.address;
    guestAddress = {
      ...validated.value.address,
      raw_text: composeFullAddress(validated.value.address),
      geo_verified: validated.value.geoVerified,
    };
  } else {
    // Non-null: populated above whenever `guestAccount` is null.
    const saved = accountAddress as SavedAddress;
    if (channel === "delivery" && (saved.lat === 0 || saved.lng === 0)) {
      return {
        status: "validation_error",
        message: `Taze ürünler için haritadan konum onaylı bir ${DELIVERY_PROVINCE} adresi gerekli.`,
      };
    }
    address = saved;
    accountAddressId = saved.id;
  }

  const deliveryFeeMinor =
    channel === "delivery" ? DELIVERY_FEE_MINOR : CARGO_FEE_MINOR;
  const isCard = parsed.data.payment_method === "credit_card";
  const emailTo = actor.email;

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

  const common = {
    scheduled_for: scheduledFor,
    // A cargo order has no delivery window — there is no van to schedule.
    time_slot: channel === "delivery" ? parsed.data.time_slot : null,
    payment_method: parsed.data.payment_method,
    delivery_notes: parsed.data.delivery_notes,
    delivery_fee_minor: deliveryFeeMinor,
    items: enriched.value,
  };

  // Both writers end in `place_web_order`; the guest one just mints the customer
  // and address rows first, inside the same transaction.
  const placed =
    guestAccount && guestAddress
      ? await placeGuestOrder({
          ...common,
          first_name: guestAccount.first_name,
          last_name: guestAccount.last_name,
          phone: guestAccount.phone,
          email: guestAccount.email,
          address: guestAddress,
        })
      : await placeWebOrder({
          ...common,
          customerId: customerId ?? "",
          addressId: accountAddressId ?? "",
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
    actor_id: actor.authUserId,
    action: "order.web_placed",
    entity_type: "order",
    entity_id: placed.value.order_id,
    after: {
      order_number: placed.value.order_number,
      scheduled_for: scheduledFor,
      items_count: enriched.value.length,
      payment_method: parsed.data.payment_method,
      fulfillment_channel: placed.value.fulfillment_channel,
    },
  });

  revalidatePath("/hesap");
  revalidatePath("/orders");

  const totalMinor = subtotalMinor + deliveryFeeMinor;
  const addressText = composeFullAddress(address);
  const customerName = [actor.firstName, actor.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  // ---- Card path → PayTR hosted payment (order stays pending until callback)
  // No confirmation e-mail here: at this point the payment hasn't happened yet.
  // The webhook sends it once the money actually lands — see
  // features/storefront/application/send-order-confirmation.ts.
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
      userPhone: actor.phone ?? "",
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
      channel: placed.value.fulfillment_channel,
      scheduledFor: scheduledFor,
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
      bankTransfer:
        parsed.data.payment_method === "bank_transfer"
          ? {
              iban: BANK_TRANSFER_IBAN,
              accountHolder: BANK_TRANSFER_ACCOUNT_HOLDER,
              bankName: BANK_TRANSFER_BANK_NAME,
              whatsappUrl: buildBankTransferWhatsAppLink(
                placed.value.order_number,
                totalMinor,
              ),
            }
          : null,
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

  return {
    status: "success",
    orderNumber: placed.value.order_number,
    paymentMethod: parsed.data.payment_method,
    totalMinor,
    hasEmail: Boolean(emailTo),
  };
}
