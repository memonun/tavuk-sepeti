/**
 * The grid Sheet's one-call customer load (get-customer-detail-action.ts): the
 * customer plus their orders. A failed orders read must not hide the customer —
 * the Sheet still opens and says the orders couldn't be loaded, as before.
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

const getCustomerById = vi.fn();
vi.mock("@/features/customers/application/get-customer", () => ({
  getCustomerById: (...a: unknown[]) => getCustomerById(...a),
}));

const listCustomerOrdersAction = vi.fn();
vi.mock("@/features/orders/application/list-customer-orders", () => ({
  listCustomerOrdersAction: (...a: unknown[]) => listCustomerOrdersAction(...a),
}));

const { getCustomerDetailAction } = await import("./get-customer-detail-action");

const CUSTOMER_ID = "11111111-2222-4333-8444-555555555555";
const customer = { id: CUSTOMER_ID, first_name: "Ayşe" };
const orders = { items: [{ id: "o1" }], total: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  assertAdmin.mockResolvedValue(ok({ id: "admin", email: null }));
  getCustomerById.mockResolvedValue(ok(customer));
  listCustomerOrdersAction.mockResolvedValue(ok(orders));
});

describe("getCustomerDetailAction", () => {
  it("returns the customer and their orders together", async () => {
    const result = await getCustomerDetailAction(CUSTOMER_ID);
    expect(result).toEqual(ok({ customer, orders }));
    expect(listCustomerOrdersAction).toHaveBeenCalledWith(CUSTOMER_ID);
  });

  it("still returns the customer when the orders read fails", async () => {
    listCustomerOrdersAction.mockResolvedValue(err(new ExternalApiError({ message: "x" })));
    const result = await getCustomerDetailAction(CUSTOMER_ID);
    expect(result).toEqual(ok({ customer, orders: null }));
  });

  it("passes the customer's own error through", async () => {
    const failure = new ExternalApiError({ message: "db down" });
    getCustomerById.mockResolvedValue(err(failure));
    expect(await getCustomerDetailAction(CUSTOMER_ID)).toEqual(err(failure));
  });

  it("rejects a non-admin or a malformed id before reading anything", async () => {
    const denied = new UnauthorizedError({ message: "Oturum bulunamadı." });
    assertAdmin.mockResolvedValueOnce(err(denied));
    expect(await getCustomerDetailAction(CUSTOMER_ID)).toEqual(err(denied));
    expect((await getCustomerDetailAction("nope")).ok).toBe(false);
    expect(getCustomerById).not.toHaveBeenCalled();
  });
});
