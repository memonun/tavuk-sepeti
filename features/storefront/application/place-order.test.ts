/**
 * Orchestration tests for the storefront checkout.
 *
 * These assert the DECISIONS the action makes, not the infrastructure it calls:
 * that an anonymous submit never writes, that a stale basket is refused rather
 * than silently switching channel, that an address belonging to someone else is
 * rejected, and that the channel handed to the writer is re-derived from
 * re-priced catalog items rather than taken from the browser.
 *
 * Follows the repo's mock-then-`await import()` pattern (see
 * features/geocoding/application/geocode-address.test.ts): every infrastructure
 * module is mocked BEFORE the module under test is imported, so the mocks are
 * wired before it reads them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>() as unknown as Headers,
}));

const logAudit = vi.fn();
vi.mock("@/shared/audit/log-audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));

const sendEmail = vi.fn();
vi.mock("@/shared/email/send-email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

const notifyAdminOfNewOrder = vi.fn();
vi.mock("@/features/admin-notifications/application/notify-admin-new-order", () => ({
  notifyAdminOfNewOrder: (...a: unknown[]) => notifyAdminOfNewOrder(...a),
}));

const listActiveProducts = vi.fn();
vi.mock("@/features/products/application/list-products", () => ({
  listActiveProducts: () => listActiveProducts(),
}));

const resolveCheckoutSession = vi.fn();
vi.mock("@/features/storefront/application/checkout-account", async () => {
  // readCheckoutAccountInput is pure FormData plumbing shared with the account
  // step — mocking it would test nothing and hide a field-name mismatch.
  const actual = await vi.importActual<
    typeof import("@/features/storefront/application/checkout-account")
  >("@/features/storefront/application/checkout-account");
  return {
    readCheckoutAccountInput: actual.readCheckoutAccountInput,
    resolveCheckoutSession: (...a: unknown[]) => resolveCheckoutSession(...a),
  };
});

// The owner-editable rules. Mocked so the tests state the rule they exercise
// instead of depending on whatever the settings row happens to hold.
const getStorefrontSettings = vi.fn();
vi.mock("@/features/storefront/application/get-storefront-settings", () => ({
  getStorefrontSettings: () => getStorefrontSettings(),
}));

const resolveCheckoutCustomer = vi.fn();
vi.mock("@/features/storefront/application/resolve-checkout-customer", () => ({
  resolveCheckoutCustomer: (...a: unknown[]) => resolveCheckoutCustomer(...a),
}));

const listMyAddresses = vi.fn();
vi.mock("@/features/storefront/application/list-addresses", () => ({
  listMyAddresses: () => listMyAddresses(),
}));

const placeWebOrder = vi.fn();
const placeGuestOrder = vi.fn();
vi.mock("@/features/storefront/infrastructure/web-order.repository", () => ({
  placeWebOrder: (...a: unknown[]) => placeWebOrder(...a),
  placeGuestOrder: (...a: unknown[]) => placeGuestOrder(...a),
}));

const validateCheckoutAddress = vi.fn();
vi.mock("@/features/storefront/application/validate-checkout-address", () => ({
  validateCheckoutAddress: (...a: unknown[]) => validateCheckoutAddress(...a),
}));

const isPaytrEnabled = vi.fn();
const createPaytrPaymentSession = vi.fn();
vi.mock("@/features/payments/application/paytr", () => ({
  isPaytrEnabled: () => isPaytrEnabled(),
  createPaytrPaymentSession: (...a: unknown[]) => createPaytrPaymentSession(...a),
}));

const { placeOrderAction } = await import(
  "@/features/storefront/application/place-order"
);

// ---- Fixtures ---------------------------------------------------------------

const EGGS = {
  key: "eggs",
  display_name: "Yumurta",
  unit: "package",
  unit_label: "paket",
  package_size: 15,
  min_qty: 1,
  step: 1,
  current_unit_price_minor: 12500,
  price_tiers: [],
  active: true,
  fulfillment_type: "delivery" as const,
  is_web_visible: true,
  is_featured: false,
  web_description: null,
  image_path: null,
  image_alt: null,
};

const APRICOT = { ...EGGS, key: "kayisi", display_name: "Kuru Kayısı", fulfillment_type: "shipping" as const };

const MALATYA_ADDRESS = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  label: "Ev",
  city: "Malatya",
  district: "Battalgazi",
  neighborhood: "Çavuşoğlu",
  street: "Atatürk Cd.",
  building_no: "12",
  apartment_no: "3",
  postal_code: "44100",
  description: "",
  raw_text: "Atatürk Cd. No: 12/3, Çavuşoğlu Mh., Battalgazi/Malatya",
  lat: 38.3552,
  lng: 38.3095,
  accuracy: "rooftop" as const,
  source: "user_pin" as const,
  is_primary: true,
  geo_verified: true,
};

/** A cargo-only address: saved with no pin, so it can never serve a route order. */
const ISTANBUL_ADDRESS = {
  ...MALATYA_ADDRESS,
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  label: "İş",
  city: "İstanbul",
  district: "Kadıköy",
  neighborhood: "Caferağa",
  lat: 0,
  lng: 0,
  is_primary: false,
  geo_verified: false,
};

/** Malatya, geo-verified, but saved via the cargo form with no door detail —
 *  route-capable per province+pin, but NOT upgrade-eligible (isRouteUpgradeEligible
 *  also requires street + apartment_no). */
const MALATYA_ADDRESS_NO_DOOR_DETAIL = {
  ...MALATYA_ADDRESS,
  id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
  label: "Malatya (kargo formu)",
  street: "",
  building_no: "",
  apartment_no: "",
  is_primary: false,
};

function buildForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    account_mode: "existing",
    address_id: MALATYA_ADDRESS.id,
    address_mode: "route",
    scheduled_for: futureDate(),
    time_slot: "",
    payment_method: "cash_on_delivery",
    distance_sales_accepted: "on",
    delivery_notes: "",
    items_json: JSON.stringify([{ product_key: "eggs", quantity: 2 }]),
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

/**
 * "Today" in Europe/Istanbul — must agree with the action's own
 * `todayInIstanbul()`, or these helpers compute a calendar day that disagrees
 * with the server's scheduling window. A raw `new Date()` + `setUTCDate()>
 * cursor (the previous shape of these helpers) drifts from Istanbul's
 * calendar for the ~3 hours a day (21:00–00:00 UTC) after Istanbul has
 * already crossed midnight but UTC has not — which is exactly what made this
 * suite flake once a day instead of failing consistently.
 */
function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Pure calendar-day arithmetic on an ISO string — mirrors `addDaysIso`. */
function addDays(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function weekday(dateIso: string): number {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/** The next configured "eve servis" day (Wed/Sat) at least a day out — the
 *  same date the checkout's day picker would offer. */
function futureDate(): string {
  let cursor = addDays(todayIso(), 1);
  while (![3, 6].includes(weekday(cursor))) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

/** A day the van does NOT drive, inside the scheduling window. */
function nonDeliveryDate(): string {
  let cursor = addDays(todayIso(), 1);
  while ([3, 6].includes(weekday(cursor))) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

/** Tomorrow — what the action stamps on a cargo order, which is never asked
 *  for a preparation day. */
function tomorrow(): string {
  return addDays(todayIso(), 1);
}

/** An all-cargo basket that clears the 1.000 ₺ floor (10 × 125 ₺). */
const CARGO_ITEMS = JSON.stringify([{ product_key: "kayisi", quantity: 10 }]);

const idle = { status: "idle" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  listActiveProducts.mockResolvedValue({ ok: true, value: [EGGS, APRICOT] });
  getStorefrontSettings.mockResolvedValue({
    homeDeliveryDays: [3, 6], // Çarşamba + Cumartesi
    cargoMinOrderMinor: 100_000, // 1.000 ₺
    homeMinOrderMinor: 25_000, // 250 ₺
  });
  resolveCheckoutSession.mockResolvedValue({
    ok: true,
    value: {
      kind: "session",
      session: {
        authUserId: "auth-1",
        email: "ayse@example.com",
        firstName: "Ayşe",
        lastName: "Yılmaz",
        phone: "+905321234567",
      },
    },
  });
  resolveCheckoutCustomer.mockResolvedValue({ ok: true, value: "customer-1" });
  listMyAddresses.mockResolvedValue({
    ok: true,
    value: [MALATYA_ADDRESS, ISTANBUL_ADDRESS, MALATYA_ADDRESS_NO_DOOR_DETAIL],
  });
  placeWebOrder.mockResolvedValue({
    ok: true,
    value: {
      order_id: "order-1",
      order_number: "ORD-2026-00001",
      fulfillment_channel: "delivery",
    },
  });
  isPaytrEnabled.mockReturnValue(true);
  sendEmail.mockResolvedValue({ ok: true, value: undefined });
  notifyAdminOfNewOrder.mockResolvedValue(undefined);
});

describe("placeOrderAction — account gate", () => {
  it("writes nothing when the session cannot be resolved", async () => {
    resolveCheckoutSession.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Sipariş vermek için giriş yapın." },
    });

    const state = await placeOrderAction(idle, buildForm());

    expect(state.status).toBe("validation_error");
    expect(placeWebOrder).not.toHaveBeenCalled();
    expect(resolveCheckoutCustomer).not.toHaveBeenCalled();
  });

  // Supabase "Confirm email" is on: the account exists but has no session, so
  // the order cannot be written. The basket must survive.
  it("stops at verify_email without placing the order", async () => {
    resolveCheckoutSession.mockResolvedValue({
      ok: true,
      value: { kind: "verify_email", email: "ayse@example.com" },
    });

    const state = await placeOrderAction(idle, buildForm());

    expect(state).toEqual({ status: "verify_email", email: "ayse@example.com" });
    expect(placeWebOrder).not.toHaveBeenCalled();
  });

  it("resolves the customer from the login, never from the phone", async () => {
    await placeOrderAction(idle, buildForm());

    expect(resolveCheckoutCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ authUserId: "auth-1" }),
    );
    expect(placeWebOrder).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "customer-1" }),
    );
  });
});

describe("placeOrderAction — address", () => {
  it("rejects an address that is not one of the account's own", async () => {
    const state = await placeOrderAction(
      idle,
      buildForm({ address_id: "cccccccc-cccc-cccc-cccc-cccccccccccc" }),
    );

    expect(state.status).toBe("validation_error");
    expect(placeWebOrder).not.toHaveBeenCalled();
  });

  // The route drives to a lat/lng. An address saved without a confirmed pin is
  // the "no pin" sentinel (0,0) and must never carry a delivery order.
  it("rejects a route order whose address has no confirmed pin", async () => {
    const state = await placeOrderAction(
      idle,
      buildForm({ address_id: ISTANBUL_ADDRESS.id }),
    );

    expect(state.status).toBe("validation_error");
    if (state.status !== "validation_error") return;
    expect(state.message).toMatch(/Malatya/);
    expect(placeWebOrder).not.toHaveBeenCalled();
  });

  it("passes the chosen address id to the writer", async () => {
    await placeOrderAction(idle, buildForm());

    expect(placeWebOrder).toHaveBeenCalledWith(
      expect.objectContaining({ addressId: MALATYA_ADDRESS.id }),
    );
  });

  it("records the accepted sales-document versions on an account order", async () => {
    await placeOrderAction(idle, buildForm());

    expect(placeWebOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        legal_acceptance: expect.objectContaining({
          accepted_at: expect.any(String),
          documents: [
            { slug: "on-bilgilendirme-formu", version: "2026-08-20" },
            { slug: "mesafeli-satis-sozlesmesi", version: "2026-08-20" },
          ],
        }),
      }),
    );
  });
});

describe("placeOrderAction — fulfillment channel", () => {
  it("treats a mixed basket as one route order (the cargo goods ride along)", async () => {
    const state = await placeOrderAction(
      idle,
      buildForm({
        items_json: JSON.stringify([
          { product_key: "eggs", quantity: 1 },
          { product_key: "kayisi", quantity: 1 },
        ]),
      }),
    );

    expect(state.status).toBe("success");
    expect(placeWebOrder).toHaveBeenCalledTimes(1);
    const call = placeWebOrder.mock.calls[0]?.[0] as { items: unknown[] };
    expect(call.items).toHaveLength(2);
  });

  it("places an all-cargo basket with no delivery time slot", async () => {
    placeWebOrder.mockResolvedValue({
      ok: true,
      value: {
        order_id: "order-2",
        order_number: "ORD-2026-00002",
        fulfillment_channel: "shipping",
      },
    });

    const state = await placeOrderAction(
      idle,
      buildForm({
        address_mode: "cargo",
        address_id: ISTANBUL_ADDRESS.id,
        time_slot: "morning",
        payment_method: "bank_transfer",
        items_json: CARGO_ITEMS,
      }),
    );

    expect(state.status).toBe("success");
    expect(placeWebOrder).toHaveBeenCalledWith(
      expect.objectContaining({ time_slot: null }),
    );
  });

  // The basket's nature changed under the customer (an admin flipped a product
  // to cargo while the tab was open). Refuse rather than quietly place the order
  // in the other channel with the wrong address form.
  it("refuses when the client's address_mode disagrees with the re-priced basket", async () => {
    const state = await placeOrderAction(
      idle,
      buildForm({
        address_mode: "cargo",
        items_json: JSON.stringify([{ product_key: "eggs", quantity: 1 }]),
      }),
    );

    expect(state.status).toBe("validation_error");
    if (state.status !== "validation_error") return;
    expect(state.message).toMatch(/Sepetiniz değişti/);
    expect(placeWebOrder).not.toHaveBeenCalled();
  });
});

describe("placeOrderAction — address-aware channel upgrade", () => {
  // Owner decision 2026-08-13: a flexible-only basket (no delivery-only line)
  // still becomes a delivery order when the address is genuinely route-capable
  // — same "ride along in the van" treatment a mixed basket already gets.
  it("upgrades a flexible-only basket to delivery, unlocking kapıda ödeme", async () => {
    placeWebOrder.mockResolvedValue({
      ok: true,
      value: {
        order_id: "order-6",
        order_number: "ORD-2026-00006",
        fulfillment_channel: "delivery",
      },
    });

    const state = await placeOrderAction(
      idle,
      buildForm({
        address_mode: "cargo",
        payment_method: "cash_on_delivery",
        items_json: JSON.stringify([{ product_key: "kayisi", quantity: 3 }]),
      }),
    );

    expect(state.status).toBe("success");
    expect(placeWebOrder).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method: "cash_on_delivery" }),
    );
  });

  // The upgraded order is checked against the (lower) eve-servis floor, not
  // the cargo one — 125 ₺ clears no cargo minimum question here at all, the
  // rejection must name the eve-servis floor and its own 250 ₺ number.
  it("applies the eve-servis floor, not the cargo floor, to an upgraded order", async () => {
    const state = await placeOrderAction(
      idle,
      buildForm({
        address_mode: "cargo",
        payment_method: "bank_transfer",
        items_json: JSON.stringify([{ product_key: "kayisi", quantity: 1 }]), // 125 ₺
      }),
    );

    expect(state.status).toBe("validation_error");
    if (state.status !== "validation_error") return;
    expect(state.message).toMatch(/Eve servis/);
    expect(state.message).toMatch(/250,00/);
    expect(state.message).not.toMatch(/1\.000,00/);
    expect(placeWebOrder).not.toHaveBeenCalled();
  });

  // Same province and a confirmed pin is NOT enough on its own — a route stop
  // still needs a door. isRouteUpgradeEligible also requires street +
  // apartment_no, so this basket stays on the cargo floor / no kapıda ödeme.
  it("does not upgrade a route-capable-but-door-detail-missing address", async () => {
    placeWebOrder.mockResolvedValue({
      ok: true,
      value: {
        order_id: "order-7",
        order_number: "ORD-2026-00007",
        fulfillment_channel: "shipping",
      },
    });

    const state = await placeOrderAction(
      idle,
      buildForm({
        address_mode: "cargo",
        address_id: MALATYA_ADDRESS_NO_DOOR_DETAIL.id,
        payment_method: "bank_transfer",
        items_json: CARGO_ITEMS, // clears the 1.000 ₺ cargo floor
      }),
    );

    expect(state.status).toBe("success");
    expect(placeWebOrder).toHaveBeenCalledWith(
      expect.objectContaining({ time_slot: null }),
    );
  });
});

describe("placeOrderAction — pricing and payment", () => {
  // Prices are recomputed from the catalog; the browser only ever contributes
  // product_key + quantity.
  it("re-prices every line from the catalog", async () => {
    await placeOrderAction(idle, buildForm());

    const call = placeWebOrder.mock.calls[0]?.[0] as {
      items: Array<{ unit_price_minor: number; line_total_minor: number }>;
    };
    expect(call.items[0]?.unit_price_minor).toBe(12500);
    expect(call.items[0]?.line_total_minor).toBe(25000);
  });

  it("rejects a basket below the product's minimum quantity", async () => {
    const state = await placeOrderAction(
      idle,
      buildForm({ items_json: JSON.stringify([{ product_key: "eggs", quantity: 0.5 }]) }),
    );

    expect(state.status).toBe("validation_error");
    expect(placeWebOrder).not.toHaveBeenCalled();
  });

  // Guard BEFORE the write, so a misconfigured card path never strands a
  // pending order nobody can pay for.
  it("refuses a card order without creating one when PayTR is off", async () => {
    isPaytrEnabled.mockReturnValue(false);

    const state = await placeOrderAction(
      idle,
      buildForm({ payment_method: "credit_card" }),
    );

    expect(state.status).toBe("error");
    expect(placeWebOrder).not.toHaveBeenCalled();
  });

  it("redirects to PayTR for a card order", async () => {
    createPaytrPaymentSession.mockResolvedValue({
      ok: true,
      value: { paymentUrl: "https://paytr.example/pay/abc" },
    });

    const state = await placeOrderAction(
      idle,
      buildForm({ payment_method: "credit_card" }),
    );

    expect(state).toEqual({
      status: "redirect",
      url: "https://paytr.example/pay/abc",
    });
    expect(placeWebOrder).toHaveBeenCalledTimes(1);
  });
});

describe("placeOrderAction — eve servis günleri", () => {
  it("accepts a day the van drives", async () => {
    const state = await placeOrderAction(idle, buildForm());

    expect(state.status).toBe("success");
    expect(placeWebOrder).toHaveBeenCalledWith(
      expect.objectContaining({ scheduled_for: futureDate() }),
    );
  });

  // The day picker only offers real delivery days; this is the same rule
  // enforced where it counts, so a hand-crafted submit cannot book a van on a
  // day it does not go out.
  it("refuses a day outside the configured delivery days", async () => {
    const state = await placeOrderAction(
      idle,
      buildForm({ scheduled_for: nonDeliveryDate() }),
    );

    expect(state.status).toBe("validation_error");
    if (state.status !== "validation_error") return;
    expect(state.message).toMatch(/Çarşamba ve Cumartesi/);
    expect(placeWebOrder).not.toHaveBeenCalled();
  });

  it("follows the owner's day change without a deploy", async () => {
    getStorefrontSettings.mockResolvedValue({
      homeDeliveryDays: [1], // Pazartesi only
      cargoMinOrderMinor: 100_000,
      homeMinOrderMinor: 25_000,
    });

    const state = await placeOrderAction(idle, buildForm());

    expect(state.status).toBe("validation_error");
    if (state.status !== "validation_error") return;
    expect(state.message).toMatch(/Pazartesi/);
  });

  // Out-of-city parcels are not asked for a "hazırlanma günü" at all, so the
  // form sends none and the action stamps the earliest allowed day itself
  // (the column is NOT NULL and every ops list sorts by it).
  it("stamps the earliest day on a cargo order that sends none", async () => {
    placeWebOrder.mockResolvedValue({
      ok: true,
      value: {
        order_id: "order-3",
        order_number: "ORD-2026-00003",
        fulfillment_channel: "shipping",
      },
    });

    const state = await placeOrderAction(
      idle,
      buildForm({
        address_mode: "cargo",
        address_id: ISTANBUL_ADDRESS.id,
        scheduled_for: "",
        payment_method: "bank_transfer",
        items_json: CARGO_ITEMS,
      }),
    );

    expect(state.status).toBe("success");
    expect(placeWebOrder).toHaveBeenCalledWith(
      expect.objectContaining({ scheduled_for: tomorrow() }),
    );
  });
});

describe("placeOrderAction — cargo order floor", () => {
  it("refuses a cargo basket below the limit and says what is missing", async () => {
    const state = await placeOrderAction(
      idle,
      buildForm({
        address_mode: "cargo",
        address_id: ISTANBUL_ADDRESS.id,
        payment_method: "bank_transfer",
        items_json: JSON.stringify([{ product_key: "kayisi", quantity: 2 }]),
      }),
    );

    expect(state.status).toBe("validation_error");
    if (state.status !== "validation_error") return;
    expect(state.message).toMatch(/1\.000,00/);
    expect(state.message).toMatch(/750,00/); // 1000 ₺ − 250 ₺ already in the basket
    expect(placeWebOrder).not.toHaveBeenCalled();
  });

  // The floor is measured on the RE-PRICED subtotal, never on anything the
  // browser computed.
  it("lets a cargo basket exactly on the limit through", async () => {
    placeWebOrder.mockResolvedValue({
      ok: true,
      value: {
        order_id: "order-4",
        order_number: "ORD-2026-00004",
        fulfillment_channel: "shipping",
      },
    });

    const state = await placeOrderAction(
      idle,
      buildForm({
        address_mode: "cargo",
        address_id: ISTANBUL_ADDRESS.id,
        payment_method: "bank_transfer",
        items_json: JSON.stringify([{ product_key: "kayisi", quantity: 8 }]),
      }),
    );

    expect(state.status).toBe("success");
  });

  // A basket with a fresh line rides the van; there is no shipping cost to
  // recover, so the 1.000 ₺ CARGO floor must not apply to it — it still owes
  // the lower 250 ₺ eve-servis floor, so the quantity here clears that one.
  it("never applies the cargo floor to a home-delivery basket", async () => {
    const state = await placeOrderAction(
      idle,
      buildForm({ items_json: JSON.stringify([{ product_key: "eggs", quantity: 3 }]) }),
    );

    expect(state.status).toBe("success");
  });
});

describe("placeOrderAction — payment method by channel", () => {
  // Our driver takes cash at the door; a cargo courier collects nothing on our
  // behalf, so an unpaid parcel would ship across Türkiye with no way back.
  it("refuses kapıda nakit ödeme on a cargo order", async () => {
    const state = await placeOrderAction(
      idle,
      buildForm({
        address_mode: "cargo",
        address_id: ISTANBUL_ADDRESS.id,
        payment_method: "cash_on_delivery",
        items_json: CARGO_ITEMS,
      }),
    );

    expect(state.status).toBe("validation_error");
    if (state.status !== "validation_error") return;
    expect(state.message).toMatch(/yalnızca eve servis/);
    expect(placeWebOrder).not.toHaveBeenCalled();
  });

  it("still allows kapıda nakit ödeme on a home delivery", async () => {
    const state = await placeOrderAction(
      idle,
      buildForm({ payment_method: "cash_on_delivery" }),
    );

    expect(state.status).toBe("success");
  });

  it("allows havale on a cargo order", async () => {
    placeWebOrder.mockResolvedValue({
      ok: true,
      value: {
        order_id: "order-5",
        order_number: "ORD-2026-00005",
        fulfillment_channel: "shipping",
      },
    });

    const state = await placeOrderAction(
      idle,
      buildForm({
        address_mode: "cargo",
        address_id: ISTANBUL_ADDRESS.id,
        payment_method: "bank_transfer",
        items_json: CARGO_ITEMS,
      }),
    );

    expect(state.status).toBe("success");
  });
});

describe("placeOrderAction — bookkeeping", () => {
  // The admin path audits every order; the web path used to audit none.
  it("writes an audit row naming the customer as the actor", async () => {
    await placeOrderAction(idle, buildForm());

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "auth-1",
        action: "order.web_placed",
        entity_type: "order",
        entity_id: "order-1",
      }),
    );
  });

  it("surfaces a writer guard (e.g. outside the service area) as a validation error", async () => {
    placeWebOrder.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Bu adres teslimat bölgemizin dışında.",
      },
    });

    const state = await placeOrderAction(idle, buildForm());

    expect(state.status).toBe("validation_error");
    if (state.status !== "validation_error") return;
    expect(state.message).toMatch(/teslimat bölgemizin dışında/);
  });

  it("rejects a delivery date outside the allowed window", async () => {
    const state = await placeOrderAction(
      idle,
      buildForm({ scheduled_for: "2020-01-01" }),
    );

    expect(state.status).toBe("validation_error");
    expect(placeWebOrder).not.toHaveBeenCalled();
  });
});

/**
 * Guest checkout.
 *
 * The load-bearing assertion is the same one `resolve-checkout-customer.test.ts`
 * makes for accounts: NOTHING is looked up. The previous guest writer upserted
 * `customers` ON CONFLICT (phone), which silently attached every guest order to
 * whichever legacy phone-ordered record shared the number — the regression the
 * owner outlawed. Re-introducing guests must not re-introduce it.
 */
describe("placeOrderAction — guest", () => {
  function guestForm(overrides: Record<string, string> = {}): FormData {
    return buildForm({
      account_mode: "guest",
      address_id: "",
      first_name: "Veli",
      last_name: "Demir",
      phone: "0532 111 22 33",
      account_email: "veli@example.com",
      addr_city: "Malatya",
      addr_district: "Battalgazi",
      addr_neighborhood: "Çamurlu",
      addr_street: "Atatürk Cd.",
      addr_building_no: "12",
      addr_apartment_no: "3",
      addr_lat: "38.35",
      addr_lng: "38.31",
      addr_source: "user_pin",
      addr_accuracy: "rooftop",
      ...overrides,
    });
  }

  beforeEach(() => {
    validateCheckoutAddress.mockResolvedValue({
      ok: true,
      value: {
        address: {
          label: null,
          city: "Malatya",
          district: "Battalgazi",
          neighborhood: "Çamurlu",
          street: "Atatürk Cd.",
          building_no: "12",
          apartment_no: "3",
          postal_code: "",
          description: null,
          lat: 38.35,
          lng: 38.31,
          source: "user_pin",
          accuracy: "rooftop",
        },
        geoVerified: true,
      },
    });
    placeGuestOrder.mockResolvedValue({
      ok: true,
      value: {
        order_id: "order-g1",
        order_number: "ORD-2026-00999",
        fulfillment_channel: "delivery",
      },
    });
  });

  it("places the order without touching the session or the account writer", async () => {
    const state = await placeOrderAction({ status: "idle" }, guestForm());

    expect(state).toMatchObject({
      status: "success",
      orderNumber: "ORD-2026-00999",
    });
    // No session to resolve, and no customer to look up: the RPC mints both.
    expect(resolveCheckoutSession).not.toHaveBeenCalled();
    expect(resolveCheckoutCustomer).not.toHaveBeenCalled();
    expect(placeWebOrder).not.toHaveBeenCalled();
    expect(placeGuestOrder).toHaveBeenCalledTimes(1);
  });

  it("carries the typed identity through to the writer", async () => {
    await placeOrderAction({ status: "idle" }, guestForm());

    expect(placeGuestOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        first_name: "Veli",
        last_name: "Demir",
        email: "veli@example.com",
        // Normalised to E.164 by the schema, exactly as an account signup is.
        phone: "+905321112233",
      }),
    );
  });

  it("refuses a guest order that also claims a saved address", async () => {
    const state = await placeOrderAction(
      { status: "idle" },
      guestForm({ address_id: "11111111-1111-4111-8111-111111111111" }),
    );

    expect(state.status).toBe("validation_error");
    expect(placeGuestOrder).not.toHaveBeenCalled();
  });

  it("refuses a guest order with no sales-document acceptance", async () => {
    const state = await placeOrderAction(
      { status: "idle" },
      guestForm({ distance_sales_accepted: "" }),
    );

    expect(state.status).toBe("validation_error");
    expect(placeGuestOrder).not.toHaveBeenCalled();
  });

  it("stops on an address the service-area check rejects", async () => {
    validateCheckoutAddress.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Bu adres teslimat bölgemizin dışında." },
    });

    const state = await placeOrderAction({ status: "idle" }, guestForm());

    expect(state).toMatchObject({
      status: "validation_error",
      message: "Bu adres teslimat bölgemizin dışında.",
    });
    expect(placeGuestOrder).not.toHaveBeenCalled();
  });

  // E-mail is optional for a guest: reachable by phone alone, and
  // lookup_guest_order/siparis-sorgula finds the order by phone either way.
  it("places an order with no e-mail, and sends no confirmation mail", async () => {
    const state = await placeOrderAction(
      { status: "idle" },
      guestForm({ account_email: "" }),
    );

    expect(state).toMatchObject({ status: "success", hasEmail: false });
    expect(placeGuestOrder).toHaveBeenCalledWith(
      expect.objectContaining({ email: null }),
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still sends the confirmation mail when the guest gave one", async () => {
    const state = await placeOrderAction({ status: "idle" }, guestForm());

    expect(state).toMatchObject({ status: "success", hasEmail: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("records the accepted sales-document versions on a guest order", async () => {
    await placeOrderAction({ status: "idle" }, guestForm());

    expect(placeGuestOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        legal_acceptance: expect.objectContaining({
          accepted_at: expect.any(String),
          documents: [
            { slug: "on-bilgilendirme-formu", version: "2026-08-20" },
            { slug: "mesafeli-satis-sozlesmesi", version: "2026-08-20" },
          ],
        }),
      }),
    );
  });

  it("refuses a card payment from a guest with no e-mail — PayTR needs one", async () => {
    const state = await placeOrderAction(
      { status: "idle" },
      guestForm({ account_email: "", payment_method: "credit_card" }),
    );

    expect(state).toMatchObject({
      status: "validation_error",
      message: "Kart ile ödeme için e-posta adresi gerekli.",
    });
    expect(placeGuestOrder).not.toHaveBeenCalled();
  });
});
