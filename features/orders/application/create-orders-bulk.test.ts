/**
 * The bulk screen sends ONE fee for the whole batch; the server must decide per
 * order (10+ paket yumurta ship free, domain/free-delivery.ts). The UI preview
 * is advisory — this is the enforcement.
 *
 * Mock-then-`await import()` pattern, as in get-order-detail-action.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ok } from "@/shared/result";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/audit/log-audit", () => ({ logAudit: vi.fn() }));

vi.mock("@/features/auth/application/get-session", () => ({
  getCurrentUser: async () => ({ id: "admin-1" }),
}));

vi.mock("@/features/customers/application/customer-price-actions", () => ({
  getCustomersMissingPrimaryAddressAction: async () => [],
  getCustomerProductPricesBatchAction: async () => [],
}));

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
  fulfillment_type: "delivery",
  is_web_visible: true,
  is_featured: false,
  web_description: null,
  image_path: null,
  image_alt: null,
  sort_order: 0,
  total_quantity_sold: 0,
};
const MILK = { ...EGGS, key: "milk", display_name: "Süt", unit: "liter", unit_label: "lt" };

vi.mock("@/features/products/application/list-products", () => ({
  listActiveProducts: async () => ok([EGGS, MILK]),
}));

const createOrdersBulk = vi.fn();
vi.mock("@/features/orders/infrastructure/order.repository", () => ({
  createOrdersBulk: (...a: unknown[]) => createOrdersBulk(...a),
}));

const { createOrdersBulkAction } = await import("./create-orders-bulk");

const C1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function formFor(
  orders: Array<{ customer_id: string; items: Array<{ product_key: string; quantity: number }> }>,
  extra: Record<string, unknown> = {},
): FormData {
  const fd = new FormData();
  fd.set(
    "batch_json",
    JSON.stringify({
      scheduled_for: "2026-10-28",
      time_slot: null,
      payment_method: "cash_on_delivery",
      delivery_fee_minor: 5000,
      orders,
      ...extra,
    }),
  );
  return fd;
}

function sentFees(): number[] {
  const input = createOrdersBulk.mock.calls[0]![0] as {
    orders: Array<{ delivery_fee_minor: number }>;
  };
  return input.orders.map((o) => o.delivery_fee_minor);
}

beforeEach(() => {
  createOrdersBulk.mockReset();
  createOrdersBulk.mockImplementation(async (input: { orders: Array<{ customer_id: string }> }) =>
    ok(input.orders.map((o, i) => ({ customer_id: o.customer_id, order_id: `o${i}`, order_number: `N${i}` }))),
  );
});

describe("createOrdersBulkAction delivery fee", () => {
  it("waives the fee only for the order with 10+ paket yumurta", async () => {
    const result = await createOrdersBulkAction(
      { status: "idle" },
      formFor([
        { customer_id: C1, items: [{ product_key: "eggs", quantity: 10 }] },
        { customer_id: C2, items: [{ product_key: "eggs", quantity: 9 }] },
      ]),
    );
    expect(result.status).toBe("success");
    expect(sentFees()).toEqual([0, 5000]);
  });

  it("keeps the fee on orders without enough eggs, whatever else they hold", async () => {
    await createOrdersBulkAction(
      { status: "idle" },
      formFor([{ customer_id: C1, items: [{ product_key: "milk", quantity: 12 }] }]),
    );
    expect(sentFees()).toEqual([5000]);
  });

  it("counts eggs together with other products in the same order", async () => {
    await createOrdersBulkAction(
      { status: "idle" },
      formFor([
        {
          customer_id: C1,
          items: [
            { product_key: "milk", quantity: 2 },
            { product_key: "eggs", quantity: 10 },
          ],
        },
      ]),
    );
    expect(sentFees()).toEqual([0]);
  });
});
