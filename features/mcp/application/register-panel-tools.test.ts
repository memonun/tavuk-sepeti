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

  it("exposes exactly the intended tools, with only two writers", async () => {
    const { tools } = await (await connect()).listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));

    expect([...byName.keys()].sort()).toEqual(
      [
        "confirm_orders",
        "get_agenda",
        "get_customer",
        "get_dashboard_summary",
        "get_finance_summary",
        "get_order",
        "list_customers",
        "list_orders",
        "list_products",
        "transition_order",
      ].sort(),
    );

    const writers = tools
      .filter((t) => t.annotations?.readOnlyHint === false)
      .map((t) => t.name)
      .sort();
    expect(writers).toEqual(["confirm_orders", "transition_order"]);
    expect(byName.get("transition_order")?.annotations?.destructiveHint).toBe(true);
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
