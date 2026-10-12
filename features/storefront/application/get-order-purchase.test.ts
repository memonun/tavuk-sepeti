/**
 * The paid-order summary is the one place a browser can learn what an order
 * contained without a login. It must answer ONLY for an order the server reads
 * as paid for an authorized caller — and must not even look otherwise.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getReturnPaymentState = vi.fn();
vi.mock("@/features/storefront/application/get-order-payment-status", () => ({
  getReturnPaymentState,
}));

const readOrderPurchase = vi.fn();
vi.mock("@/features/storefront/infrastructure/order-purchase.repository", () => ({
  readOrderPurchase,
}));

const { getReturnOrderPurchase } = await import(
  "@/features/storefront/application/get-order-purchase"
);
const { fetchPaidOrderPurchase } = await import(
  "@/features/storefront/application/fetch-paid-order-purchase"
);

const PURCHASE = {
  orderNumber: "ORD-2026-00123",
  totalMinor: 45_000,
  items: [{ productKey: "eggs", quantity: 2 }],
};

beforeEach(() => {
  getReturnPaymentState.mockReset();
  readOrderPurchase.mockReset();
  readOrderPurchase.mockResolvedValue({ ok: true, value: PURCHASE });
});

describe("getReturnOrderPurchase", () => {
  it.each([["unpaid"], ["unknown"]])(
    "answers null and never reads the order while it is %s",
    async (state) => {
      getReturnPaymentState.mockResolvedValue(state);

      const result = await getReturnOrderPurchase({
        orderNumber: "ORD-2026-00123",
        returnToken: "tok",
      });

      expect(result).toBeNull();
      expect(readOrderPurchase).not.toHaveBeenCalled();
    },
  );

  it("returns the server's total and lines once the order is paid", async () => {
    getReturnPaymentState.mockResolvedValue("paid");

    const result = await getReturnOrderPurchase({
      orderNumber: "ORD-2026-00123",
      returnToken: "tok",
    });

    expect(result).toEqual(PURCHASE);
    expect(getReturnPaymentState).toHaveBeenCalledWith({
      orderNumber: "ORD-2026-00123",
      returnToken: "tok",
    });
    expect(readOrderPurchase).toHaveBeenCalledWith("ORD-2026-00123");
  });

  it("answers null when the read fails or finds nothing", async () => {
    getReturnPaymentState.mockResolvedValue("paid");

    readOrderPurchase.mockResolvedValueOnce({ ok: false, error: { code: "EXTERNAL_API_ERROR" } });
    expect(
      await getReturnOrderPurchase({ orderNumber: "ORD-2026-00123", returnToken: null }),
    ).toBeNull();

    readOrderPurchase.mockResolvedValueOnce({ ok: true, value: null });
    expect(
      await getReturnOrderPurchase({ orderNumber: "ORD-2026-00123", returnToken: null }),
    ).toBeNull();
  });
});

describe("fetchPaidOrderPurchase", () => {
  it.each([
    ["an empty order number", { orderNumber: "  ", returnToken: null }],
    ["an oversized order number", { orderNumber: "x".repeat(65), returnToken: null }],
    ["an oversized token", { orderNumber: "ORD-2026-00123", returnToken: "t".repeat(257) }],
  ])("rejects %s before touching anything", async (_name, input) => {
    expect(await fetchPaidOrderPurchase(input)).toBeNull();
    expect(getReturnPaymentState).not.toHaveBeenCalled();
    expect(readOrderPurchase).not.toHaveBeenCalled();
  });

  it("passes a valid request through, order number trimmed", async () => {
    getReturnPaymentState.mockResolvedValue("paid");

    const result = await fetchPaidOrderPurchase({
      orderNumber: " ORD-2026-00123 ",
      returnToken: "tok",
    });

    expect(result).toEqual(PURCHASE);
    expect(getReturnPaymentState).toHaveBeenCalledWith({
      orderNumber: "ORD-2026-00123",
      returnToken: "tok",
    });
  });
});
