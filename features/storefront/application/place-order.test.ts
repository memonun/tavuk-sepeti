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

const listActiveProducts = vi.fn();
vi.mock("@/features/products/application/list-products", () => ({
  listActiveProducts: () => listActiveProducts(),
}));

const resolveCheckoutSession = vi.fn();
vi.mock("@/features/storefront/application/checkout-account", () => ({
  resolveCheckoutSession: (...a: unknown[]) => resolveCheckoutSession(...a),
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
vi.mock("@/features/storefront/infrastructure/web-order.repository", () => ({
  placeWebOrder: (...a: unknown[]) => placeWebOrder(...a),
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

function buildForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    account_mode: "existing",
    address_id: MALATYA_ADDRESS.id,
    address_mode: "route",
    scheduled_for: futureDate(),
    time_slot: "",
    payment_method: "cash_on_delivery",
    delivery_notes: "",
    items_json: JSON.stringify([{ product_key: "eggs", quantity: 2 }]),
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

/** Tomorrow in Europe/Istanbul — the earliest date the window allows. */
function futureDate(): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + 3);
  return now.toISOString().slice(0, 10);
}

const idle = { status: "idle" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  listActiveProducts.mockResolvedValue({ ok: true, value: [EGGS, APRICOT] });
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
    value: [MALATYA_ADDRESS, ISTANBUL_ADDRESS],
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
        items_json: JSON.stringify([{ product_key: "kayisi", quantity: 1 }]),
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
