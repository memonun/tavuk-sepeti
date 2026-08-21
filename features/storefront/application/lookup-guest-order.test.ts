/**
 * `lookupGuestOrder` is the only door a guest has back into an order once
 * placed — see the header comment on the module under test. These tests
 * pin the two things that make that door safe: the phone is mandatory
 * (order number alone must never resolve anything), and a miss is
 * indistinguishable from "wrong phone" (no error, just `null`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  },
}));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const rpc = vi.fn();
vi.mock("@/shared/supabase/admin", () => ({
  getSupabaseAdminClient: () => ({ rpc }),
}));

const { lookupGuestOrder } = await import(
  "@/features/storefront/application/lookup-guest-order"
);

describe("lookupGuestOrder", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("never calls the RPC without a phone", async () => {
    const result = await lookupGuestOrder("ORD-2026-00123", "");

    expect(result).toEqual({ ok: true, value: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never calls the RPC without an order number", async () => {
    const result = await lookupGuestOrder("  ", "0532 111 22 33");

    expect(result).toEqual({ ok: true, value: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls lookup_guest_order with the trimmed number and normalized phone", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await lookupGuestOrder(" ORD-2026-00123 ", "0532 111 22 33");

    expect(rpc).toHaveBeenCalledWith("lookup_guest_order", {
      p_order_number: "ORD-2026-00123",
      p_phone: "+905321112233",
    });
  });

  it("returns null on no match, not an error", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const result = await lookupGuestOrder("ORD-2026-00123", "0532 111 22 33");

    expect(result).toEqual({ ok: true, value: null });
  });

  it("maps a matching row, including line items and amount paid, but never address or name", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          order_id: "order-1",
          order_number: "ORD-2026-00123",
          status: "pending",
          payment_status: "awaiting_payment",
          payment_method: "bank_transfer",
          total_minor: 210000,
          amount_paid_minor: 100000,
          scheduled_for: "2026-08-19",
          fulfillment_channel: "shipping",
          created_at: "2026-08-16T00:00:00Z",
          cargo_carrier: "PTT Kargo",
          cargo_tracking_number: "1234567890",
          cargo_tracking_url: "https://example.com/track/1234567890",
          items: [
            {
              display_name: "Kuru Kayısı",
              unit_label: "kg",
              quantity: 2,
              unit_price_minor: 70000,
              line_total_minor: 140000,
            },
          ],
        },
      ],
      error: null,
    });

    const result = await lookupGuestOrder("ORD-2026-00123", "0532 111 22 33");

    expect(result).toEqual({
      ok: true,
      value: {
        // Bank transfer, so no card callback can be in flight for it.
        awaitingCardConfirmation: false,
        orderId: "order-1",
        orderNumber: "ORD-2026-00123",
        status: "pending",
        paymentStatus: "awaiting_payment",
        paymentMethod: "bank_transfer",
        totalMinor: 210000,
        amountPaidMinor: 100000,
        scheduledFor: "2026-08-19",
        channel: "shipping",
        createdAt: "2026-08-16T00:00:00Z",
        cargoCarrier: "PTT Kargo",
        cargoTrackingNumber: "1234567890",
        cargoTrackingUrl: "https://example.com/track/1234567890",
        estimatedDeliveryAt: null,
        items: [
          {
            displayName: "Kuru Kayısı",
            unitLabel: "kg",
            quantity: 2,
            unitPriceMinor: 70000,
            lineTotalMinor: 140000,
          },
        ],
      },
    });
    // Nothing in the mapped view carries a customer's name, e-mail or
    // delivery address — those never leave the RPC in the first place, but
    // this pins the mapper's contract too.
    const keys = Object.keys(result.ok ? result.value! : {});
    expect(keys).not.toContain("address");
    expect(keys).not.toContain("name");
    expect(keys).not.toContain("email");
  });

  it("degrades to an empty item list when the row has no items column yet", async () => {
    // Deploy-skew case: this app code ships slightly ahead of the migration
    // that adds `items`, so the RPC still returns rows without it.
    rpc.mockResolvedValue({
      data: [
        {
          order_id: "order-1",
          order_number: "ORD-2026-00123",
          status: "pending",
          payment_status: "pending",
          payment_method: "bank_transfer",
          total_minor: 210000,
          scheduled_for: "2026-08-19",
          fulfillment_channel: "shipping",
          created_at: "2026-08-16T00:00:00Z",
          cargo_carrier: null,
          cargo_tracking_number: null,
          cargo_tracking_url: null,
        },
      ],
      error: null,
    });

    const result = await lookupGuestOrder("ORD-2026-00123", "0532 111 22 33");

    expect(result.ok).toBe(true);
    expect(result.ok && result.value?.items).toEqual([]);
    expect(result.ok && result.value?.amountPaidMinor).toBe(0);
  });

  it("drops a malformed item entry instead of throwing", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          order_id: "order-1",
          order_number: "ORD-2026-00123",
          status: "pending",
          payment_status: "pending",
          payment_method: "bank_transfer",
          total_minor: 210000,
          amount_paid_minor: 0,
          scheduled_for: "2026-08-19",
          fulfillment_channel: "shipping",
          created_at: "2026-08-16T00:00:00Z",
          cargo_carrier: null,
          cargo_tracking_number: null,
          cargo_tracking_url: null,
          items: [null, "not an object", { unit_label: "kg" }],
        },
      ],
      error: null,
    });

    const result = await lookupGuestOrder("ORD-2026-00123", "0532 111 22 33");

    expect(result.ok).toBe(true);
    expect(result.ok && result.value?.items).toEqual([]);
  });

  it("surfaces an RPC failure as an error result", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST000", message: "boom" },
    });

    const result = await lookupGuestOrder("ORD-2026-00123", "0532 111 22 33");

    expect(result.ok).toBe(false);
  });
});
