/**
 * Drives the real MCP server over an in-memory transport so the tool surface
 * (names, annotations, zod→JSON-schema, validation) is exercised exactly as a
 * client sees it. The application functions underneath are mocked.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ok } from "@/shared/result";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const listOrders = vi.fn();
const transitionOrderAs = vi.fn();
const confirmOrdersAs = vi.fn();
vi.mock("@/features/orders/application/list-orders", () => ({
  listOrders: (...a: unknown[]) => listOrders(...a),
}));
vi.mock("@/features/orders/application/transition-order-as", () => ({
  transitionOrderAs: (...a: unknown[]) => transitionOrderAs(...a),
}));
vi.mock("@/features/orders/application/confirm-orders-as", () => ({
  confirmOrdersAs: (...a: unknown[]) => confirmOrdersAs(...a),
}));
vi.mock("@/features/orders/application/get-order", () => ({
  getOrderById: vi.fn(),
  getOrderEvents: vi.fn(),
}));
vi.mock("@/features/orders/application/get-dashboard-order-stats", () => ({
  getDashboardOrderStats: vi.fn(),
}));
vi.mock("@/features/customers/application/list-customers", () => ({ listCustomers: vi.fn() }));
vi.mock("@/features/customers/application/get-customer", () => ({ getCustomerById: vi.fn() }));
vi.mock("@/features/products/application/list-products", () => ({ listAllProducts: vi.fn() }));
vi.mock("@/features/finance/application/get-finance-summary", () => ({
  getFinanceSummary: vi.fn(),
}));
vi.mock("@/features/agenda/application/get-agenda-page", () => ({ getAgendaPage: vi.fn() }));
vi.mock("@/features/orders/application/payments", () => ({
  addPaymentAction: vi.fn(),
  deletePaymentAction: vi.fn(),
  getOrderPaymentsAction: vi.fn(),
  markOrderFullyPaidAction: vi.fn(),
}));
vi.mock("@/features/orders/application/bulk-delete-orders", () => ({ bulkDeleteOrdersAction: vi.fn() }));
vi.mock("@/features/orders/application/create-order", () => ({ createOrderAction: vi.fn() }));
vi.mock("@/features/orders/application/update-order", () => ({ updateOrderAction: vi.fn() }));
vi.mock("@/features/customers/application/bulk-delete-customers", () => ({ bulkDeleteCustomersAction: vi.fn() }));
vi.mock("@/features/customers/application/create-customer", () => ({ createCustomerAction: vi.fn() }));
vi.mock("@/features/customers/application/update-customer", () => ({ updateCustomerAction: vi.fn() }));
vi.mock("@/features/products/application/create-product", () => ({ createProductAction: vi.fn() }));
vi.mock("@/features/products/application/delete-product", () => ({ deleteProductAction: vi.fn() }));
vi.mock("@/features/products/application/save-product-pricing", () => ({ saveProductPricingAction: vi.fn() }));
vi.mock("@/features/products/application/set-product-active", () => ({ setProductActiveAction: vi.fn() }));
vi.mock("@/features/products/application/set-product-flags", () => ({ updateProductFlagsAction: vi.fn() }));
vi.mock("@/features/products/application/update-product-metadata", () => ({ updateProductMetadataAction: vi.fn() }));
vi.mock("@/features/products/application/remove-product-image", () => ({ removeProductImageAction: vi.fn() }));
vi.mock("@/features/products/application/upload-product-image", () => ({ uploadProductImageAction: vi.fn() }));
vi.mock("@/features/mcp/infrastructure/fetch-remote-image", () => ({ fetchRemoteImage: vi.fn() }));
vi.mock("@/features/finance/application/expense-actions", () => ({
  createExpenseAction: vi.fn(),
  updateExpenseAction: vi.fn(),
  deleteExpenseAction: vi.fn(),
  markExpensePaidAction: vi.fn(),
}));
vi.mock("@/features/finance/application/list-expense-categories", () => ({ listExpenseCategoriesFlat: vi.fn() }));
vi.mock("@/features/finance/application/list-expenses", () => ({ listExpenses: vi.fn() }));
vi.mock("@/features/finance/application/list-market-locations", () => ({ listMarketLocations: vi.fn() }));
vi.mock("@/features/finance/application/list-market-sales", () => ({ listMarketSales: vi.fn(), getMarketSaleById: vi.fn() }));
vi.mock("@/features/finance/application/market-sale-actions", () => ({
  createMarketSaleAction: vi.fn(),
  updateMarketSaleAction: vi.fn(),
  deleteMarketSaleAction: vi.fn(),
}));
vi.mock("@/features/agenda/application/agenda-task-actions", () => ({
  createAgendaTaskAction: vi.fn(),
  updateAgendaTaskAction: vi.fn(),
  setAgendaTaskCompletedAction: vi.fn(),
  deleteAgendaTaskAction: vi.fn(),
}));

const { registerPanelTools } = await import("@/features/mcp/application/register-panel-tools");

const ORDER_ID = "4f1c2b9e-8a7d-4c3b-9e2f-1a2b3c4d5e6f";

async function connect(): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0" });
  registerPanelTools(server, { id: "admin-1" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "c", version: "0" });
  await client.connect(clientSide);
  return client;
}

function firstText(result: unknown): string {
  const content = (result as { content: Array<{ text?: string }> }).content;
  return content[0]?.text ?? "";
}

describe("panel MCP tools", () => {
  beforeEach(() => {
    listOrders.mockReset();
    transitionOrderAs.mockReset();
    confirmOrdersAs.mockReset();
  });

  it("exposes exactly the intended tools and marks every writer", async () => {
    const { tools } = await (await connect()).listTools();

    const readers = tools
      .filter((t) => t.annotations?.readOnlyHint === true)
      .map((t) => t.name)
      .sort();
    expect(readers).toEqual(
      [
        "get_agenda",
        "get_customer",
        "get_dashboard_summary",
        "get_finance_summary",
        "get_order",
        "get_order_payments",
        "list_customers",
        "list_expense_categories",
        "list_expenses",
        "list_market_locations",
        "list_market_sales",
        "list_orders",
        "list_products",
      ].sort(),
    );

    const writers = tools
      .filter((t) => t.annotations?.readOnlyHint === false)
      .map((t) => t.name)
      .sort();
    expect(writers).toEqual(
      [
        "add_order_payment",
        "complete_agenda_task",
        "confirm_orders",
        "create_agenda_task",
        "create_customer",
        "create_expense",
        "create_market_sale",
        "create_order",
        "create_product",
        "delete_agenda_task",
        "delete_customers",
        "delete_expense",
        "delete_market_sale",
        "delete_order_payment",
        "delete_orders",
        "delete_product",
        "mark_expense_paid",
        "mark_order_fully_paid",
        "remove_product_image",
        "set_product_active",
        "set_product_flags",
        "set_product_image",
        "set_product_pricing",
        "transition_order",
        "update_agenda_task",
        "update_customer",
        "update_expense",
        "update_market_sale",
        "update_order",
        "update_product",
      ].sort(),
    );
    // Nothing is unclassified.
    expect(readers.length + writers.length).toBe(tools.length);
  });

  it("flags every delete (and cancel) as destructive and requires confirm:true", async () => {
    const { tools } = await (await connect()).listTools();
    const deletes = tools.filter((t) => t.name.startsWith("delete_") || t.name === "remove_product_image");
    expect(deletes.length).toBe(8);
    for (const tool of deletes) {
      expect(tool.annotations?.destructiveHint, tool.name).toBe(true);
      const schema = tool.inputSchema as { required?: string[]; properties?: Record<string, unknown> };
      expect(schema.required, tool.name).toContain("confirm");
    }
    expect(tools.find((t) => t.name === "transition_order")?.annotations?.destructiveHint).toBe(true);
  });

  it("caps pageSize at 100 before reaching the application layer", async () => {
    const client = await connect();
    const res = await client.callTool({
      name: "list_orders",
      arguments: { pageSize: 2000 },
    });
    expect(res.isError).toBe(true);
    expect(listOrders).not.toHaveBeenCalled();
  });

  it("applies pagination defaults and forwards filters", async () => {
    listOrders.mockResolvedValue(ok({ items: [], total: 0, page: 1, pageSize: 25 }));
    const client = await connect();
    await client.callTool({ name: "list_orders", arguments: { status: "pending" } });
    expect(listOrders).toHaveBeenCalledWith({ status: "pending", page: 1, pageSize: 25 });
  });

  it("acts as the verified admin, tagged source=mcp", async () => {
    transitionOrderAs.mockResolvedValue({
      status: "success",
      orderId: ORDER_ID,
      fromStatus: "pending",
      toStatus: "confirmed",
    });
    const client = await connect();
    const res = await client.callTool({
      name: "transition_order",
      arguments: { order_id: ORDER_ID, to_status: "confirmed" },
    });
    expect(res.isError).toBeFalsy();
    expect(transitionOrderAs).toHaveBeenCalledWith(
      { id: "admin-1" },
      { order_id: ORDER_ID, to_status: "confirmed", reason: null },
      { source: "mcp" },
    );
    expect(JSON.parse(firstText(res))).toMatchObject({ ok: true, from: "pending", to: "confirmed" });
  });

  it("relays a state-machine refusal as a tool error", async () => {
    transitionOrderAs.mockResolvedValue({
      status: "error",
      message: "İptal için neden gerekli.",
    });
    const client = await connect();
    const res = await client.callTool({
      name: "transition_order",
      arguments: { order_id: ORDER_ID, to_status: "cancelled" },
    });
    expect(res.isError).toBe(true);
    expect(firstText(res)).toContain("İptal için neden gerekli.");
  });

  it("rejects a malformed order id without touching the database", async () => {
    const client = await connect();
    const res = await client.callTool({
      name: "transition_order",
      arguments: { order_id: "not-a-uuid", to_status: "confirmed" },
    });
    expect(res.isError).toBe(true);
    expect(transitionOrderAs).not.toHaveBeenCalled();
  });

  it("confirms orders and reports the count", async () => {
    confirmOrdersAs.mockResolvedValue({ status: "success", confirmed: 1, confirmedIds: [ORDER_ID] });
    const client = await connect();
    const res = await client.callTool({
      name: "confirm_orders",
      arguments: { order_ids: [ORDER_ID, "7c9e6679-7425-40de-944b-e07fc1f90ae7"] },
    });
    expect(JSON.parse(firstText(res))).toMatchObject({ ok: true, requested: 2, confirmed: 1 });
  });
});
