/**
 * The grid Sheet's one-call order load (get-order-detail-action.ts). It must
 * return exactly what the five separate actions used to give the Sheet: the
 * order (or its error), and empty lists — never a failure — when only the
 * timeline, payments or gifts can't be read. The customer's special prices
 * matter most: without them the edit form would re-price the order at catalog
 * prices on save.
 *
 * Follows the repo's mock-then-`await import()` pattern (see
 * features/storefront/application/place-order.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExternalApiError, UnauthorizedError } from "@/shared/errors/app-error";
import { err, ok } from "@/shared/result";

const assertAdmin = vi.fn();
vi.mock("@/features/auth/application/assert-admin", () => ({
  assertAdmin: () => assertAdmin(),
}));

const getOrderById = vi.fn();
const getOrderEvents = vi.fn();
vi.mock("@/features/orders/application/get-order", () => ({
  getOrderById: (...a: unknown[]) => getOrderById(...a),
  getOrderEvents: (...a: unknown[]) => getOrderEvents(...a),
}));

const getOrderGifts = vi.fn();
vi.mock("@/features/orders/application/get-order-gifts", () => ({
  getOrderGifts: (...a: unknown[]) => getOrderGifts(...a),
}));

const listPaymentsForOrder = vi.fn();
vi.mock("@/features/orders/infrastructure/order-payment.repository", () => ({
  listPaymentsForOrder: (...a: unknown[]) => listPaymentsForOrder(...a),
}));

const loadCustomerProductPriceMap = vi.fn();
vi.mock("@/features/customers/application/customer-prices", () => ({
  loadCustomerProductPriceMap: (...a: unknown[]) => loadCustomerProductPriceMap(...a),
}));

const { getOrderDetailAction } = await import("./get-order-detail-action");

const ORDER_ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const CUSTOMER_ID = "11111111-2222-4333-8444-555555555555";
const order = { id: ORDER_ID, customer_id: CUSTOMER_ID };
const repoError = () => new ExternalApiError({ message: "db down" });

beforeEach(() => {
  vi.clearAllMocks();
  assertAdmin.mockResolvedValue(ok({ id: "admin", email: null }));
  getOrderById.mockResolvedValue(ok(order));
  getOrderEvents.mockResolvedValue(ok([{ id: "e1" }]));
  listPaymentsForOrder.mockResolvedValue(ok([{ id: "p1" }]));
  getOrderGifts.mockResolvedValue(ok([{ id: "g1" }]));
  loadCustomerProductPriceMap.mockResolvedValue(new Map([["yumurta-30", 4500]]));
});

describe("getOrderDetailAction", () => {
  it("returns everything the Sheet shows in one result", async () => {
    const result = await getOrderDetailAction(ORDER_ID);
    expect(result).toEqual(
      ok({
        order,
        events: [{ id: "e1" }],
        payments: [{ id: "p1" }],
        gifts: [{ id: "g1" }],
        customerPrices: { "yumurta-30": 4500 },
      }),
    );
    // The special prices are the order's customer's, looked up after the order.
    expect(loadCustomerProductPriceMap).toHaveBeenCalledWith(CUSTOMER_ID);
  });

  it("rejects a non-admin before reading anything", async () => {
    const denied = new UnauthorizedError({ message: "Oturum bulunamadı." });
    assertAdmin.mockResolvedValue(err(denied));
    const result = await getOrderDetailAction(ORDER_ID);
    expect(result).toEqual(err(denied));
    expect(getOrderById).not.toHaveBeenCalled();
  });

  it("rejects a malformed id before reading anything", async () => {
    const result = await getOrderDetailAction("not-a-uuid");
    expect(result.ok).toBe(false);
    expect(getOrderById).not.toHaveBeenCalled();
  });

  it("passes the order's own error through when the order can't be read", async () => {
    const failure = repoError();
    getOrderById.mockResolvedValue(err(failure));
    const result = await getOrderDetailAction(ORDER_ID);
    expect(result).toEqual(err(failure));
    expect(loadCustomerProductPriceMap).not.toHaveBeenCalled();
  });

  it("degrades timeline / payments / gifts to empty lists instead of failing", async () => {
    getOrderEvents.mockResolvedValue(err(repoError()));
    listPaymentsForOrder.mockResolvedValue(err(repoError()));
    getOrderGifts.mockResolvedValue(err(repoError()));
    const result = await getOrderDetailAction(ORDER_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.events).toEqual([]);
    expect(result.value.payments).toEqual([]);
    expect(result.value.gifts).toEqual([]);
    expect(result.value.order).toEqual(order);
  });
});
