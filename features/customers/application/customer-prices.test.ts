/**
 * A price typed on an order line is for that order only. It becomes the
 * customer's standing price only when the line is marked "Müşteri için kaydet",
 * and a saved price is removed only when the caller says so — never as a side
 * effect of an empty box or a deleted line.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ok } from "@/shared/result";

vi.mock("server-only", () => ({}));

const getCustomerProductPrices = vi.fn();
const upsertCustomerProductPrices = vi.fn();
const deleteCustomerProductPrices = vi.fn();
vi.mock("@/features/customers/infrastructure/customer-price.repository", () => ({
  getCustomerProductPrices: (...a: unknown[]) => getCustomerProductPrices(...a),
  upsertCustomerProductPrices: (...a: unknown[]) => upsertCustomerProductPrices(...a),
  deleteCustomerProductPrices: (...a: unknown[]) => deleteCustomerProductPrices(...a),
}));

const { reconcileCustomerProductPrices } = await import("./customer-prices");

const CUSTOMER = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  getCustomerProductPrices.mockReset();
  upsertCustomerProductPrices.mockReset();
  deleteCustomerProductPrices.mockReset();
  getCustomerProductPrices.mockResolvedValue(ok([{ product_key: "eggs", unit_price_minor: 10000 }]));
  upsertCustomerProductPrices.mockResolvedValue(ok(undefined));
  deleteCustomerProductPrices.mockResolvedValue(ok(undefined));
});

describe("reconcileCustomerProductPrices", () => {
  it("does not save a special price that is not marked — it is this order only", async () => {
    await reconcileCustomerProductPrices(CUSTOMER, [
      { product_key: "eggs", unit_price_minor: 11667 },
      { product_key: "milk", unit_price_minor: 4500, save_for_customer: false },
    ]);
    expect(upsertCustomerProductPrices).not.toHaveBeenCalled();
    expect(deleteCustomerProductPrices).not.toHaveBeenCalled();
  });

  it("saves the price of a line marked 'Müşteri için kaydet'", async () => {
    await reconcileCustomerProductPrices(CUSTOMER, [
      { product_key: "milk", unit_price_minor: 4500, save_for_customer: true },
      { product_key: "eggs", unit_price_minor: 11667 },
    ]);
    expect(upsertCustomerProductPrices).toHaveBeenCalledWith(CUSTOMER, [
      { product_key: "milk", unit_price_minor: 4500 },
    ]);
  });

  it("changes an existing saved price when the line is marked with a new amount", async () => {
    await reconcileCustomerProductPrices(CUSTOMER, [
      { product_key: "eggs", unit_price_minor: 9000, save_for_customer: true },
    ]);
    expect(upsertCustomerProductPrices).toHaveBeenCalledWith(CUSTOMER, [
      { product_key: "eggs", unit_price_minor: 9000 },
    ]);
  });

  it("skips the write when the marked price equals the saved one", async () => {
    await reconcileCustomerProductPrices(CUSTOMER, [
      { product_key: "eggs", unit_price_minor: 10000, save_for_customer: true },
    ]);
    expect(upsertCustomerProductPrices).not.toHaveBeenCalled();
  });

  it("ignores the mark on a line without a price", async () => {
    await reconcileCustomerProductPrices(CUSTOMER, [
      { product_key: "milk", save_for_customer: true },
    ]);
    expect(upsertCustomerProductPrices).not.toHaveBeenCalled();
  });

  it("removes a saved price only when asked to", async () => {
    await reconcileCustomerProductPrices(CUSTOMER, [{ product_key: "eggs" }], ["eggs", "milk"]);
    // milk has no saved price, so only eggs is deleted.
    expect(deleteCustomerProductPrices).toHaveBeenCalledWith(CUSTOMER, ["eggs"]);
  });

  it("an empty price box or a missing line never deletes a saved price", async () => {
    await reconcileCustomerProductPrices(CUSTOMER, [{ product_key: "eggs" }]);
    await reconcileCustomerProductPrices(CUSTOMER, []);
    expect(deleteCustomerProductPrices).not.toHaveBeenCalled();
  });

  it("saving a new price wins over a removal of the same product", async () => {
    await reconcileCustomerProductPrices(
      CUSTOMER,
      [{ product_key: "eggs", unit_price_minor: 9000, save_for_customer: true }],
      ["eggs"],
    );
    expect(upsertCustomerProductPrices).toHaveBeenCalledTimes(1);
    expect(deleteCustomerProductPrices).not.toHaveBeenCalled();
  });

  it("does not even read the saved prices when there is nothing to do", async () => {
    await reconcileCustomerProductPrices(CUSTOMER, [{ product_key: "eggs", unit_price_minor: 1 }]);
    expect(getCustomerProductPrices).not.toHaveBeenCalled();
  });
});
