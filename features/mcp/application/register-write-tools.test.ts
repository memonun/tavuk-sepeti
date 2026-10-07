/**
 * Each write tool must hand the panel's own Server Action exactly what the
 * panel would send. The actions are mocked, so this pins the adapter contract:
 * argument shape, the read-before-write merges, and error/validation relaying.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ValidationError } from "@/shared/errors/app-error";
import { err, ok } from "@/shared/result";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const m = {
  createOrderAction: vi.fn(),
  updateOrderAction: vi.fn(),
  bulkDeleteOrdersAction: vi.fn(),
  addPaymentAction: vi.fn(),
  deletePaymentAction: vi.fn(),
  markOrderFullyPaidAction: vi.fn(),
  createCustomerAction: vi.fn(),
  updateCustomerAction: vi.fn(),
  bulkDeleteCustomersAction: vi.fn(),
  getCustomerById: vi.fn(),
  createProductAction: vi.fn(),
  updateProductMetadataAction: vi.fn(),
  saveProductPricingAction: vi.fn(),
  deleteProductAction: vi.fn(),
  listAllProducts: vi.fn(),
  createAgendaTaskAction: vi.fn(),
  setAgendaTaskCompletedAction: vi.fn(),
  deleteAgendaTaskAction: vi.fn(),
};

vi.mock("@/features/orders/application/create-order", () => ({ createOrderAction: (...a: unknown[]) => m.createOrderAction(...a) }));
vi.mock("@/features/orders/application/update-order", () => ({ updateOrderAction: (...a: unknown[]) => m.updateOrderAction(...a) }));
vi.mock("@/features/orders/application/bulk-delete-orders", () => ({ bulkDeleteOrdersAction: (...a: unknown[]) => m.bulkDeleteOrdersAction(...a) }));
vi.mock("@/features/orders/application/payments", () => ({
  addPaymentAction: (...a: unknown[]) => m.addPaymentAction(...a),
  deletePaymentAction: (...a: unknown[]) => m.deletePaymentAction(...a),
  markOrderFullyPaidAction: (...a: unknown[]) => m.markOrderFullyPaidAction(...a),
  getOrderPaymentsAction: vi.fn(),
}));
vi.mock("@/features/customers/application/create-customer", () => ({ createCustomerAction: (...a: unknown[]) => m.createCustomerAction(...a) }));
vi.mock("@/features/customers/application/update-customer", () => ({ updateCustomerAction: (...a: unknown[]) => m.updateCustomerAction(...a) }));
vi.mock("@/features/customers/application/bulk-delete-customers", () => ({ bulkDeleteCustomersAction: (...a: unknown[]) => m.bulkDeleteCustomersAction(...a) }));
vi.mock("@/features/customers/application/get-customer", () => ({ getCustomerById: (...a: unknown[]) => m.getCustomerById(...a) }));
vi.mock("@/features/customers/application/list-customers", () => ({ listCustomers: vi.fn() }));
vi.mock("@/features/products/application/create-product", () => ({ createProductAction: (...a: unknown[]) => m.createProductAction(...a) }));
vi.mock("@/features/products/application/update-product-metadata", () => ({ updateProductMetadataAction: (...a: unknown[]) => m.updateProductMetadataAction(...a) }));
vi.mock("@/features/products/application/save-product-pricing", () => ({ saveProductPricingAction: (...a: unknown[]) => m.saveProductPricingAction(...a) }));
vi.mock("@/features/products/application/delete-product", () => ({ deleteProductAction: (...a: unknown[]) => m.deleteProductAction(...a) }));
vi.mock("@/features/products/application/set-product-active", () => ({ setProductActiveAction: vi.fn() }));
vi.mock("@/features/products/application/set-product-flags", () => ({ updateProductFlagsAction: vi.fn() }));
vi.mock("@/features/products/application/list-products", () => ({ listAllProducts: (...a: unknown[]) => m.listAllProducts(...a) }));
vi.mock("@/features/agenda/application/agenda-task-actions", () => ({
  createAgendaTaskAction: (...a: unknown[]) => m.createAgendaTaskAction(...a),
  updateAgendaTaskAction: vi.fn(),
  setAgendaTaskCompletedAction: (...a: unknown[]) => m.setAgendaTaskCompletedAction(...a),
  deleteAgendaTaskAction: (...a: unknown[]) => m.deleteAgendaTaskAction(...a),
}));
vi.mock("@/features/agenda/application/get-agenda-page", () => ({ getAgendaPage: vi.fn() }));
vi.mock("@/features/orders/application/list-orders", () => ({ listOrders: vi.fn() }));
vi.mock("@/features/orders/application/get-order", () => ({ getOrderById: vi.fn(), getOrderEvents: vi.fn() }));
vi.mock("@/features/orders/application/get-dashboard-order-stats", () => ({ getDashboardOrderStats: vi.fn() }));
vi.mock("@/features/orders/application/transition-order-as", () => ({ transitionOrderAs: vi.fn() }));
vi.mock("@/features/orders/application/confirm-orders-as", () => ({ confirmOrdersAs: vi.fn() }));
vi.mock("@/features/finance/application/get-finance-summary", () => ({ getFinanceSummary: vi.fn() }));

const { registerPanelTools } = await import("@/features/mcp/application/register-panel-tools");

const UUID = "4f1c2b9e-8a7d-4c3b-9e2f-1a2b3c4d5e6f";
const UUID2 = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

async function connect(): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0" });
  registerPanelTools(server, { id: "admin-1" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "c", version: "0" });
  await client.connect(clientSide);
  return client;
}

const text = (r: unknown) => (r as { content: Array<{ text?: string }> }).content[0]?.text ?? "";

describe("write tool adapters", () => {
  beforeEach(() => {
    for (const fn of Object.values(m)) fn.mockReset();
  });

  it("create_order sends the panel's form payload (items as JSON, blanks as empty strings)", async () => {
    m.createOrderAction.mockResolvedValue({ status: "success", orderId: UUID });
    const client = await connect();
    const res = await client.callTool({
      name: "create_order",
      arguments: {
        customer_id: UUID,
        scheduled_for: "2026-10-10",
        payment_method: "cash_on_delivery",
        items: [{ product_key: "dut_kurusu", quantity: 1.5 }],
      },
    });
    expect(res.isError).toBeFalsy();
    const [previous, fd] = m.createOrderAction.mock.calls[0] as [unknown, FormData];
    expect(previous).toEqual({ status: "idle" });
    expect(fd.get("customer_id")).toBe(UUID);
    expect(fd.get("time_slot")).toBe("");
    expect(fd.get("delivery_fee_minor")).toBe("0");
    expect(JSON.parse(String(fd.get("items_json")))).toEqual([{ product_key: "dut_kurusu", quantity: 1.5 }]);
    expect(JSON.parse(text(res))).toMatchObject({ ok: true, orderId: UUID });
  });

  it("relays the action's field errors so the model can correct and retry", async () => {
    m.createOrderAction.mockResolvedValue({
      status: "validation_error",
      fieldErrors: { items: ["Miktar adıma uymuyor."] },
    });
    const res = await (await connect()).callTool({
      name: "create_order",
      arguments: {
        customer_id: UUID,
        scheduled_for: "2026-10-10",
        payment_method: "bank_transfer",
        items: [{ product_key: "peynir", quantity: 0.3 }],
      },
    });
    expect(res.isError).toBe(true);
    expect(JSON.parse(text(res)).fieldErrors).toEqual({ items: ["Miktar adıma uymuyor."] });
  });

  it("delete tools refuse without confirm:true and never reach the action", async () => {
    const client = await connect();
    for (const [name, args] of [
      ["delete_orders", { order_ids: [UUID] }],
      ["delete_customers", { customer_ids: [UUID] }],
      ["delete_product", { product_key: "x" }],
      ["delete_agenda_task", { id: UUID }],
      ["delete_order_payment", { order_id: UUID, payment_id: UUID2 }],
    ] as const) {
      const res = await client.callTool({ name, arguments: args });
      expect(res.isError, name).toBe(true);
    }
    expect(m.bulkDeleteOrdersAction).not.toHaveBeenCalled();
    expect(m.bulkDeleteCustomersAction).not.toHaveBeenCalled();
    expect(m.deleteProductAction).not.toHaveBeenCalled();
    expect(m.deleteAgendaTaskAction).not.toHaveBeenCalled();
    expect(m.deletePaymentAction).not.toHaveBeenCalled();
  });

  it("delete_orders forwards the ids when confirmed", async () => {
    m.bulkDeleteOrdersAction.mockResolvedValue(ok({ deleted: 2 }));
    const res = await (await connect()).callTool({
      name: "delete_orders",
      arguments: { order_ids: [UUID, UUID2], confirm: true },
    });
    expect(m.bulkDeleteOrdersAction).toHaveBeenCalledWith([UUID, UUID2]);
    expect(JSON.parse(text(res))).toEqual({ ok: true, result: { deleted: 2 } });
  });

  it("update_customer reads the record first and preserves unmentioned fields", async () => {
    m.getCustomerById.mockResolvedValue(
      ok({
        first_name: "Ayşe",
        last_name: "Yılmaz",
        email: "ayse@example.com",
        phone: "+905321234567",
        notes: null,
        status: "active",
        address: null,
      }),
    );
    m.updateCustomerAction.mockResolvedValue({ status: "success", customerId: UUID });
    await (await connect()).callTool({
      name: "update_customer",
      arguments: { customer_id: UUID, notes: "VIP" },
    });
    const [id, , fd] = m.updateCustomerAction.mock.calls[0] as [string, unknown, FormData];
    expect(id).toBe(UUID);
    expect(fd.get("first_name")).toBe("Ayşe");
    expect(fd.get("email")).toBe("ayse@example.com");
    expect(fd.get("notes")).toBe("VIP");
  });

  it("update_product overlays the given fields on the current product", async () => {
    m.listAllProducts.mockResolvedValue(
      ok([
        {
          key: "dut_kurusu",
          display_name: "Dut Kurusu",
          unit: "kilogram",
          unit_label: "kg",
          package_size: 1,
          min_qty: 0.5,
          step: 0.5,
          fulfillment_type: "shipping",
          web_description: "Tatlı",
          image_alt: null,
        },
      ]),
    );
    m.updateProductMetadataAction.mockResolvedValue(ok(undefined));
    await (await connect()).callTool({
      name: "update_product",
      arguments: { product_key: "dut_kurusu", min_qty: 1 },
    });
    expect(m.updateProductMetadataAction).toHaveBeenCalledWith({
      product_key: "dut_kurusu",
      display_name: "Dut Kurusu",
      unit: "kilogram",
      unit_label: "kg",
      package_size: 1,
      min_qty: 1,
      step: 0.5,
      fulfillment_type: "shipping",
      web_description: "Tatlı",
      image_alt: null,
    });
  });

  it("update_product reports an unknown key instead of writing", async () => {
    m.listAllProducts.mockResolvedValue(ok([]));
    const res = await (await connect()).callTool({
      name: "update_product",
      arguments: { product_key: "yok", min_qty: 1 },
    });
    expect(res.isError).toBe(true);
    expect(m.updateProductMetadataAction).not.toHaveBeenCalled();
  });

  it("masks upstream errors but keeps the panel's validation messages", async () => {
    m.createAgendaTaskAction.mockResolvedValue(err(new ValidationError({ message: "Tekrar sıklığı eksik." })));
    const res = await (await connect()).callTool({
      name: "create_agenda_task",
      arguments: { title: "Aşı", repeat_unit: "week" },
    });
    expect(res.isError).toBe(true);
    expect(JSON.parse(text(res)).message).toBe("Tekrar sıklığı eksik.");
  });

  it("set_product_pricing passes tiers through untouched", async () => {
    m.saveProductPricingAction.mockResolvedValue(ok(undefined));
    const args = {
      product_key: "dut_kurusu",
      base_price_minor: 110000,
      tiers: [{ min_qty: 5, unit_price_minor: 100000 }],
    };
    await (await connect()).callTool({ name: "set_product_pricing", arguments: args });
    expect(m.saveProductPricingAction).toHaveBeenCalledWith(args);
  });
});
