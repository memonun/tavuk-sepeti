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
  createExpenseAction: vi.fn(),
  deleteExpenseAction: vi.fn(),
  getMarketSaleById: vi.fn(),
  updateMarketSaleAction: vi.fn(),
  createMarketSaleAction: vi.fn(),
  deleteMarketSaleAction: vi.fn(),
  fetchRemoteImage: vi.fn(),
  uploadProductImageAction: vi.fn(),
  removeProductImageAction: vi.fn(),
  listRecurringExpenseTemplatesFull: vi.fn(),
  updateRecurringExpenseTemplateAction: vi.fn(),
  createRecurringExpenseTemplateAction: vi.fn(),
  deleteRecurringExpenseTemplateAction: vi.fn(),
  listExpenseCategoriesFlat: vi.fn(),
  createExpenseCategoryAction: vi.fn(),
  updateExpenseCategoryAction: vi.fn(),
  deleteMarketLocationAction: vi.fn(),
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
vi.mock("@/features/finance/application/expense-actions", () => ({
  createExpenseAction: (...a: unknown[]) => m.createExpenseAction(...a),
  deleteExpenseAction: (...a: unknown[]) => m.deleteExpenseAction(...a),
  updateExpenseAction: vi.fn(),
  markExpensePaidAction: vi.fn(),
}));
vi.mock("@/features/finance/application/list-expense-categories", () => ({ listExpenseCategoriesFlat: (...a: unknown[]) => m.listExpenseCategoriesFlat(...a) }));
vi.mock("@/features/finance/application/list-expenses", () => ({ listExpenses: vi.fn() }));
vi.mock("@/features/finance/application/list-market-locations", () => ({ listMarketLocations: vi.fn(), listAllMarketLocations: vi.fn() }));
vi.mock("@/features/finance/application/expense-category-actions", () => ({
  createExpenseCategoryAction: (...a: unknown[]) => m.createExpenseCategoryAction(...a),
  updateExpenseCategoryAction: (...a: unknown[]) => m.updateExpenseCategoryAction(...a),
  setExpenseCategoryActiveAction: vi.fn(),
}));
vi.mock("@/features/finance/application/list-recurring-expense-templates", () => ({
  listRecurringExpenseTemplates: vi.fn(),
  listRecurringExpenseTemplatesFull: (...a: unknown[]) => m.listRecurringExpenseTemplatesFull(...a),
}));
vi.mock("@/features/finance/application/market-location-actions", () => ({
  createMarketLocationAction: vi.fn(),
  setMarketLocationActiveAction: vi.fn(),
  deleteMarketLocationAction: (...a: unknown[]) => m.deleteMarketLocationAction(...a),
}));
vi.mock("@/features/finance/application/recurring-expense-template-actions", () => ({
  createRecurringExpenseTemplateAction: (...a: unknown[]) => m.createRecurringExpenseTemplateAction(...a),
  updateRecurringExpenseTemplateAction: (...a: unknown[]) => m.updateRecurringExpenseTemplateAction(...a),
  setRecurringExpenseTemplateActiveAction: vi.fn(),
  deleteRecurringExpenseTemplateAction: (...a: unknown[]) => m.deleteRecurringExpenseTemplateAction(...a),
}));

vi.mock("@/features/finance/application/list-market-sales", () => ({
  listMarketSales: vi.fn(),
  getMarketSaleById: (...a: unknown[]) => m.getMarketSaleById(...a),
}));
vi.mock("@/features/finance/application/market-sale-actions", () => ({
  createMarketSaleAction: (...a: unknown[]) => m.createMarketSaleAction(...a),
  updateMarketSaleAction: (...a: unknown[]) => m.updateMarketSaleAction(...a),
  deleteMarketSaleAction: (...a: unknown[]) => m.deleteMarketSaleAction(...a),
}));
vi.mock("@/features/mcp/infrastructure/fetch-remote-image", () => ({ fetchRemoteImage: (...a: unknown[]) => m.fetchRemoteImage(...a) }));
vi.mock("@/features/products/application/upload-product-image", () => ({ uploadProductImageAction: (...a: unknown[]) => m.uploadProductImageAction(...a) }));
vi.mock("@/features/products/application/remove-product-image", () => ({ removeProductImageAction: (...a: unknown[]) => m.removeProductImageAction(...a) }));
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
      ["delete_expense", { id: UUID }],
      ["delete_market_sale", { id: UUID }],
      ["remove_product_image", { product_key: "x" }],
      ["delete_recurring_expense_template", { id: UUID }],
      ["delete_market_location", { id: UUID }],
    ] as const) {
      const res = await client.callTool({ name, arguments: args });
      expect(res.isError, name).toBe(true);
    }
    expect(m.bulkDeleteOrdersAction).not.toHaveBeenCalled();
    expect(m.bulkDeleteCustomersAction).not.toHaveBeenCalled();
    expect(m.deleteProductAction).not.toHaveBeenCalled();
    expect(m.deleteAgendaTaskAction).not.toHaveBeenCalled();
    expect(m.deletePaymentAction).not.toHaveBeenCalled();
    expect(m.deleteExpenseAction).not.toHaveBeenCalled();
    expect(m.deleteMarketSaleAction).not.toHaveBeenCalled();
    expect(m.removeProductImageAction).not.toHaveBeenCalled();
    expect(m.deleteRecurringExpenseTemplateAction).not.toHaveBeenCalled();
    expect(m.deleteMarketLocationAction).not.toHaveBeenCalled();
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

  it("create_expense passes the payload straight to the panel action", async () => {
    m.createExpenseAction.mockResolvedValue(ok({ id: UUID }));
    const args = {
      category_id: UUID,
      amount_minor: 125000,
      expense_date: "2026-10-07",
      payment_status: "pending",
    };
    const res = await (await connect()).callTool({ name: "create_expense", arguments: args });
    expect(m.createExpenseAction).toHaveBeenCalledWith(args);
    expect(JSON.parse(text(res))).toEqual({ ok: true, result: { id: UUID } });
  });

  it("update_market_sale keeps the stored items when none are given", async () => {
    m.getMarketSaleById.mockResolvedValue(
      ok({
        id: UUID,
        location_id: UUID2,
        sale_date: "2026-10-05",
        total_amount_minor: 90000,
        payment_method: "cash",
        note: "eski",
        items: [{ product_key: "dut_kurusu", quantity: 2, unit_price_minor: 45000 }],
      }),
    );
    m.updateMarketSaleAction.mockResolvedValue(ok({ id: UUID }));
    await (await connect()).callTool({
      name: "update_market_sale",
      arguments: { id: UUID, total_amount_minor: 95000 },
    });
    expect(m.updateMarketSaleAction).toHaveBeenCalledWith({
      id: UUID,
      location_id: UUID2,
      sale_date: "2026-10-05",
      total_amount_minor: 95000,
      payment_method: "cash",
      note: "eski",
      items: [{ product_key: "dut_kurusu", quantity: 2, unit_price_minor: 45000 }],
    });
  });

  it("set_product_image downloads first, then hands the panel's upload action a File", async () => {
    m.fetchRemoteImage.mockResolvedValue(
      ok({ bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), type: "image/jpeg" }),
    );
    m.uploadProductImageAction.mockResolvedValue(ok({ imagePath: "dut/abc.jpg" }));
    const res = await (await connect()).callTool({
      name: "set_product_image",
      arguments: { product_key: "dut_kurusu", image_url: "https://cdn.example.com/dut.jpg" },
    });
    expect(m.fetchRemoteImage).toHaveBeenCalledWith("https://cdn.example.com/dut.jpg");
    const fd = m.uploadProductImageAction.mock.calls[0]?.[0] as FormData;
    expect(fd.get("product_key")).toBe("dut_kurusu");
    const file = fd.get("file") as File;
    expect(file.type).toBe("image/jpeg");
    expect(file.size).toBe(4);
    expect(JSON.parse(text(res))).toEqual({ ok: true, result: { imagePath: "dut/abc.jpg" } });
  });

  it("set_product_image never reaches the upload action when the download is refused", async () => {
    m.fetchRemoteImage.mockResolvedValue(err(new ValidationError({ message: "Bu bağlantıdan görsel indirilemez." })));
    const res = await (await connect()).callTool({
      name: "set_product_image",
      arguments: { product_key: "dut_kurusu", image_url: "https://169.254.169.254/x.jpg" },
    });
    expect(res.isError).toBe(true);
    expect(JSON.parse(text(res)).message).toContain("indirilemez");
    expect(m.uploadProductImageAction).not.toHaveBeenCalled();
  });

  it("set_product_image rejects a non-URL before any fetch", async () => {
    const res = await (await connect()).callTool({
      name: "set_product_image",
      arguments: { product_key: "dut_kurusu", image_url: "not a url" },
    });
    expect(res.isError).toBe(true);
    expect(m.fetchRemoteImage).not.toHaveBeenCalled();
  });

  const TEMPLATE = {
    id: UUID,
    name: "Kira",
    category_id: UUID2,
    vendor: "Ev sahibi",
    description: null,
    amount_type: "fixed",
    default_amount_minor: 1500000,
    cadence: "monthly",
    day_of_week: null,
    day_of_month: 5,
    start_date: "2026-01-05",
    end_date: null,
    payment_method: "bank_transfer",
    note: null,
  };

  it("update_recurring_expense_template overlays only the given fields on the stored template", async () => {
    m.listRecurringExpenseTemplatesFull.mockResolvedValue(ok([TEMPLATE]));
    m.updateRecurringExpenseTemplateAction.mockResolvedValue(ok({ id: UUID }));
    await (await connect()).callTool({
      name: "update_recurring_expense_template",
      arguments: { id: UUID, default_amount_minor: 1650000 },
    });
    const { id, ...rest } = TEMPLATE;
    expect(m.updateRecurringExpenseTemplateAction).toHaveBeenCalledWith({
      id,
      ...rest,
      default_amount_minor: 1650000,
    });
  });

  it("update_recurring_expense_template reports an unknown id instead of writing", async () => {
    m.listRecurringExpenseTemplatesFull.mockResolvedValue(ok([]));
    const res = await (await connect()).callTool({
      name: "update_recurring_expense_template",
      arguments: { id: UUID, name: "x" },
    });
    expect(res.isError).toBe(true);
    expect(m.updateRecurringExpenseTemplateAction).not.toHaveBeenCalled();
  });

  it("update_expense_category keeps the stored parent and order unless told otherwise", async () => {
    m.listExpenseCategoriesFlat.mockResolvedValue(
      ok([{ id: UUID, name: "Yem", parent_id: UUID2, sort_order: 3, active: true }]),
    );
    m.updateExpenseCategoryAction.mockResolvedValue(ok({ id: UUID }));
    const client = await connect();
    await client.callTool({ name: "update_expense_category", arguments: { id: UUID, name: "Yem ve saman" } });
    expect(m.updateExpenseCategoryAction).toHaveBeenLastCalledWith({
      id: UUID,
      name: "Yem ve saman",
      parent_id: UUID2,
      sort_order: 3,
    });
    // An explicit null moves it to the top level.
    await client.callTool({ name: "update_expense_category", arguments: { id: UUID, parent_id: null } });
    expect(m.updateExpenseCategoryAction).toHaveBeenLastCalledWith({
      id: UUID,
      name: "Yem",
      parent_id: null,
      sort_order: 3,
    });
  });

  it("delete_market_location relays the panel's 'has sales' refusal", async () => {
    m.deleteMarketLocationAction.mockResolvedValue(
      err(new ValidationError({ message: "Bu lokasyonda kayıtlı satış var, silinemez." })),
    );
    const res = await (await connect()).callTool({
      name: "delete_market_location",
      arguments: { id: UUID, confirm: true },
    });
    expect(res.isError).toBe(true);
    expect(JSON.parse(text(res)).message).toContain("kayıtlı satış");
  });
});
